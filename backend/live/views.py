from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from livekit import api as livekit_api
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from live.models import Comment, LiveSession, Reaction
from live.realtime import broadcast_feed_event, broadcast_room_event
from live.serializers import (
    CommentSerializer,
    CreateCommentSerializer,
    CreateReactionSerializer,
    LiveSessionSerializer,
    LiveTokenRequestSerializer,
    ReactionSerializer,
    StartLiveSessionSerializer,
)


class LiveFeedView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        sessions = LiveSession.objects.filter(status=LiveSession.Status.LIVE).select_related("creator", "creator__profile")
        return Response(LiveSessionSerializer(sessions, many=True).data)


class LiveSessionDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, session_id):
        session = LiveSession.objects.filter(id=session_id).select_related("creator", "creator__profile").first()
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
        broadcast_feed_event(
            "session.started",
            {"type": "session.started", "session": session_data},
        )
        broadcast_room_event(
            session.id,
            "session.updated",
            {"type": "session.updated", "session": session_data},
        )
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
        broadcast_feed_event(
            "session.ended",
            {"type": "session.ended", "session": session_data},
        )
        broadcast_room_event(
            session.id,
            "session.ended",
            {"type": "session.ended", "session": session_data},
        )
        return Response(session_data)


class LiveSessionTokenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, session_id):
        session = LiveSession.objects.filter(id=session_id).select_related("creator").first()
        if not session:
            return Response({"detail": "Live session not found."}, status=status.HTTP_404_NOT_FOUND)

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
                "livekit_url": settings.LIVEKIT_URL,
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
        session_data = LiveSessionSerializer(session).data
        broadcast_room_event(
            session.id,
            "comment.created",
            {"type": "comment.created", "comment": comment_data},
        )
        broadcast_room_event(
            session.id,
            "session.updated",
            {"type": "session.updated", "session": session_data},
        )
        broadcast_feed_event(
            "session.updated",
            {"type": "session.updated", "session": session_data},
        )
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
        session_data = LiveSessionSerializer(session).data
        broadcast_room_event(
            session.id,
            "reaction.created",
            {
                "type": "reaction.created",
                "reaction": response_serializer.data,
                "heart_count": heart_count,
            },
        )
        broadcast_room_event(
            session.id,
            "session.updated",
            {"type": "session.updated", "session": session_data},
        )
        broadcast_feed_event(
            "session.updated",
            {"type": "session.updated", "session": session_data},
        )
        return Response(
            {
                "created": created,
                "reaction": response_serializer.data,
                "heart_count": heart_count,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
