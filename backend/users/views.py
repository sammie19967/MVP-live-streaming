from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from users.models import DirectMessage, Follow, User
from users.presence import get_online_user_ids
from users.serializers import (
    DirectMessageSerializer,
    LoginSerializer,
    ProfileSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)

MAX_DM_ATTACHMENT_SIZE = 20 * 1024 * 1024


def broadcast_dm(sender_id, recipient_id, dm_data):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    payload = {
        "type": "dm.created",
        "dm": dm_data,
    }

    async_to_sync(channel_layer.group_send)(
        f"user_chat_{sender_id}",
        {"type": "dm.created", "payload": payload},
    )

    async_to_sync(channel_layer.group_send)(
        f"user_chat_{recipient_id}",
        {"type": "dm.created", "payload": payload},
    )


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user.profile).data)

    def patch(self, request):
        profile = request.user.profile
        serializer = ProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        return Response(ProfileSerializer(profile).data)


class FollowUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id == target_user.id:
            return Response({"detail": "You cannot follow yourself."}, status=status.HTTP_400_BAD_REQUEST)

        follow, created = Follow.objects.get_or_create(follower=request.user, following=target_user)
        return Response(
            {"following_user_id": target_user.id, "created": created, "follow_id": follow.id},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DirectMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        with_user_id = request.query_params.get("with_user_id")
        if not with_user_id:
            return Response({"detail": "with_user_id query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        with_user = get_object_or_404(User, id=with_user_id)
        if with_user.id == request.user.id:
            return Response({"detail": "You cannot open a DM thread with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        DirectMessage.objects.filter(sender=with_user, recipient=request.user, is_read=False).update(is_read=True)
        messages = DirectMessage.objects.filter(
            (Q(sender=request.user) & Q(recipient=with_user)) | (Q(sender=with_user) & Q(recipient=request.user))
        ).order_by("created_at")
        serializer = DirectMessageSerializer(messages, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        recipient_id = request.data.get("recipient_id")
        body = request.data.get("body", "")
        parent_id = request.data.get("parent_id")
        attachment = request.FILES.get("attachment")
        if isinstance(body, str):
            body = body.strip()

        if not recipient_id or (not body and not attachment):
            return Response({"detail": "recipient_id and either body or attachment are required."}, status=status.HTTP_400_BAD_REQUEST)
        if attachment and attachment.size > MAX_DM_ATTACHMENT_SIZE:
            return Response({"detail": "Attachment must be 20MB or smaller."}, status=status.HTTP_400_BAD_REQUEST)

        recipient = get_object_or_404(User, id=recipient_id)
        if recipient.id == request.user.id:
            return Response({"detail": "You cannot send a DM to yourself."}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > DirectMessage._meta.get_field("body").max_length:
            return Response({"detail": "Message body must be 1000 characters or fewer."}, status=status.HTTP_400_BAD_REQUEST)

        parent = None
        if parent_id not in (None, ""):
            try:
                parent = DirectMessage.objects.get(id=parent_id)
            except (DirectMessage.DoesNotExist, ValueError, TypeError):
                return Response({"detail": "Parent message not found."}, status=status.HTTP_400_BAD_REQUEST)
            if {parent.sender_id, parent.recipient_id} != {request.user.id, recipient.id}:
                return Response({"detail": "Parent message not found."}, status=status.HTTP_400_BAD_REQUEST)

        dm = DirectMessage.objects.create(sender=request.user, recipient=recipient, body=body, parent=parent, attachment=attachment)
        serializer = DirectMessageSerializer(dm, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DMThreadListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        messages = DirectMessage.objects.filter(Q(sender=request.user) | Q(recipient=request.user)).select_related("sender", "sender__profile", "recipient", "recipient__profile")
        partner_ids = set(messages.exclude(sender=request.user).values_list("sender_id", flat=True)) | set(messages.exclude(recipient=request.user).values_list("recipient_id", flat=True))
        partners = User.objects.filter(id__in=partner_ids).select_related("profile")
        threads = []
        for partner in partners:
            last_msg = messages.filter(Q(sender=partner) | Q(recipient=partner)).order_by("-created_at").first()
            unread_count = messages.filter(sender=partner, recipient=request.user, is_read=False).count()
            threads.append({"user": UserSerializer(partner).data, "last_message": DirectMessageSerializer(last_msg, context={"request": request}).data if last_msg else None, "unread_count": unread_count})
        threads.sort(key=lambda x: x["last_message"]["created_at"] if x["last_message"] else "", reverse=True)
        return Response(threads)


class UserListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        users = User.objects.exclude(id=request.user.id).select_related("profile")
        if request.query_params.get("online_only") in {"1", "true", "True"}:
            user_ids = users.values_list("id", flat=True)
            users = users.filter(id__in=get_online_user_ids(user_ids))
        return Response(UserSerializer(users, many=True).data)
