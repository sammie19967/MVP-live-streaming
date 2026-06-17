from datetime import timedelta
from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from livekit import api as livekit_api
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from live.models import Comment, LiveSession, Reaction
from live.realtime import (
    broadcast_feed_event,
    broadcast_room_event,
    broadcast_session_update,
)
from live.serializers import (
    CommentSerializer,
    CreateCommentSerializer,
    CreateReactionSerializer,
    LiveSessionSerializer,
    LiveTokenRequestSerializer,
    ReactionSerializer,
    StartLiveSessionSerializer,
)


def get_client_livekit_url(request):
    livekit_url = settings.LIVEKIT_URL
    parsed_url = urlsplit(livekit_url)

    if parsed_url.hostname not in {"localhost", "127.0.0.1"}:
        return livekit_url

    request_host = request.get_host().split(":")[0]
    if request_host in {"localhost", "127.0.0.1"}:
        return livekit_url

    livekit_port = parsed_url.port or 7880
    netloc = f"{request_host}:{livekit_port}"
    return urlunsplit(
        (
            parsed_url.scheme or "ws",
            netloc,
            parsed_url.path,
            parsed_url.query,
            parsed_url.fragment,
        )
    )


def get_live_session_queryset():
    return LiveSession.objects.select_related("creator", "creator__profile").annotate(
        comment_count_annotated=Count(
            "comments",
            filter=Q(comments__is_deleted=False),
            distinct=True,
        ),
        heart_count_annotated=Count(
            "reactions",
            filter=Q(reactions__type=Reaction.Type.HEART),
            distinct=True,
        ),
    )


class LiveFeedView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        sessions = get_live_session_queryset().filter(status=LiveSession.Status.LIVE)
        return Response(LiveSessionSerializer(sessions, many=True).data)


class LiveSessionDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, session_id):
        session = get_live_session_queryset().filter(id=session_id).first()
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(LiveSessionSerializer(session).data)


class StartLiveSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = StartLiveSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        existing_session = LiveSession.objects.filter(
            creator=request.user,
            status=LiveSession.Status.LIVE,
        ).first()
        if existing_session:
            return Response(
                {
                    "detail": "Creator already has an active live session.",
                    "session": LiveSessionSerializer(existing_session).data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        session = LiveSession.objects.create(
            creator=request.user,
            title=serializer.validated_data["title"],
            thumbnail_url=serializer.validated_data.get("thumbnail_url", ""),
            status=LiveSession.Status.LIVE,
            started_at=timezone.now(),
        )
        session_data = LiveSessionSerializer(session).data
        broadcast_session_update(session.id, event_type="session.started")
        return Response(session_data, status=status.HTTP_201_CREATED)


class LiveSessionEndView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, session_id):
        session = LiveSession.objects.filter(id=session_id).first()
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)
        if session.creator_id != request.user.id:
            return Response({"detail": "Only the creator can end this live session."}, status=status.HTTP_403_FORBIDDEN)
        session.status = LiveSession.Status.ENDED
        session.ended_at = timezone.now()
        session.save(update_fields=["status", "ended_at"])
        session_data = LiveSessionSerializer(session).data
        broadcast_session_update(session.id, event_type="session.ended")
        return Response(session_data)


class LiveSessionTokenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, session_id):
        session = LiveSession.objects.filter(id=session_id).select_related("creator").first()
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)
        if session.status != LiveSession.Status.LIVE:
            return Response(
                {"detail": "Tokens are only issued for active live sessions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LiveTokenRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data["role"]

        if role == "creator" and session.creator_id != request.user.id:
            return Response(
                {"detail": "Only the creator can request a creator token."},
                status=status.HTTP_403_FORBIDDEN,
            )

        token = (
            livekit_api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            .with_identity(str(request.user.id))
            .with_name(request.user.username)
            .with_grants(
                livekit_api.VideoGrants(
                    room_join=True,
                    room=session.livekit_room_name,
                    can_publish=role == "creator",
                    can_subscribe=True,
                )
            )
            .with_ttl(timedelta(hours=2))
        )

        return Response(
            {
                "token": token.to_jwt(),
                "livekit_url": get_client_livekit_url(request),
                "room_name": session.livekit_room_name,
                "role": role,
            }
        )


class LiveCommentsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_session(self, session_id):
        return LiveSession.objects.filter(id=session_id).select_related("creator").first()

    def get(self, request, session_id):
        session = self.get_session(session_id)
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)

        comments = session.comments.filter(is_deleted=False).select_related("user", "user__profile")
        return Response(CommentSerializer(comments, many=True).data)

    def post(self, request, session_id):
        session = self.get_session(session_id)
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)
        if session.status != LiveSession.Status.LIVE:
            return Response({"detail": "Comments are only allowed on active live sessions."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CreateCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(
            session=session,
            user=request.user,
            body=serializer.validated_data["body"],
        )
        comment_data = CommentSerializer(comment).data
        broadcast_room_event(
            session.id,
            "comment.created",
            {"type": "comment.created", "comment": comment_data},
        )
        broadcast_session_update(session.id)
        return Response(comment_data, status=status.HTTP_201_CREATED)


class LiveReactionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, session_id):
        session = LiveSession.objects.filter(id=session_id).first()
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)
        if session.status != LiveSession.Status.LIVE:
            return Response({"detail": "Reactions are only allowed on active live sessions."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CreateReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["type"]

        reaction, created = Reaction.objects.get_or_create(
            session=session,
            user=request.user,
            type=reaction_type,
        )
        heart_count = session.reactions.filter(type=Reaction.Type.HEART).count()
        response_serializer = ReactionSerializer(reaction)
        broadcast_room_event(
            session.id,
            "reaction.created",
            {
                "type": "reaction.created",
                "reaction": response_serializer.data,
                "heart_count": heart_count,
            },
        )
        broadcast_session_update(session.id)
        return Response(
            {
                "created": created,
                "reaction": response_serializer.data,
                "heart_count": heart_count,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
