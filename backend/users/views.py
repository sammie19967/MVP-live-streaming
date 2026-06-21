from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from users.models import DirectMessage, Follow, User
from users.serializers import (
    DirectMessageSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)


def broadcast_dm(sender_id, recipient_id, dm_data):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    payload = {
        "type": "dm.created",
        "dm": dm_data,
    }

    # Broadcast to sender's private group
    async_to_sync(channel_layer.group_send)(
        f"user_chat_{sender_id}",
        {
            "type": "dm.created",
            "payload": payload,
        },
    )

    # Broadcast to recipient's private group
    async_to_sync(channel_layer.group_send)(
        f"user_chat_{recipient_id}",
        {
            "type": "dm.created",
            "payload": payload,
        },
    )



class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


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


class FollowUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response(
                {"detail": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.user.id == target_user.id:
            return Response(
                {"detail": "You cannot follow yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        follow, created = Follow.objects.get_or_create(
            follower=request.user,
            following=target_user,
        )
        return Response(
            {
                "following_user_id": target_user.id,
                "created": created,
                "follow_id": follow.id,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DirectMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        with_user_id = request.query_params.get("with_user_id")
        if not with_user_id:
            return Response(
                {"detail": "with_user_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with_user = get_object_or_404(User, id=with_user_id)
        if with_user.id == request.user.id:
            return Response(
                {"detail": "You cannot open a DM thread with yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark unread messages from this user to me as read
        DirectMessage.objects.filter(
            sender=with_user,
            recipient=request.user,
            is_read=False,
        ).update(is_read=True)

        # Retrieve message history
        messages = DirectMessage.objects.filter(
            (Q(sender=request.user) & Q(recipient=with_user))
            | (Q(sender=with_user) & Q(recipient=request.user))
        ).order_by("created_at")

        serializer = DirectMessageSerializer(messages, many=True)
        return Response(serializer.data)

    def post(self, request):
        recipient_id = request.data.get("recipient_id")
        body = request.data.get("body", "")
        if isinstance(body, str):
            body = body.strip()

        if not recipient_id or not body:
            return Response(
                {"detail": "recipient_id and body are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipient = get_object_or_404(User, id=recipient_id)
        if recipient.id == request.user.id:
            return Response(
                {"detail": "You cannot send a DM to yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(body) > DirectMessage._meta.get_field("body").max_length:
            return Response(
                {"detail": "Message body must be 1000 characters or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dm = DirectMessage.objects.create(
            sender=request.user,
            recipient=recipient,
            body=body,
        )

        dm_data = DirectMessageSerializer(dm).data

        # Real-time WebSocket broadcast
        broadcast_dm(request.user.id, recipient.id, dm_data)

        return Response(dm_data, status=status.HTTP_201_CREATED)


class DirectMessageThreadsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # Retrieve all messages involving the current user
        messages = DirectMessage.objects.filter(Q(sender=user) | Q(recipient=user))

        # Find unique user IDs that the current user has chatted with
        sender_ids = messages.exclude(sender=user).values_list("sender_id", flat=True)
        recipient_ids = messages.exclude(recipient=user).values_list("recipient_id", flat=True)
        chat_partner_ids = set(sender_ids).union(set(recipient_ids))

        # Get user instances
        partners = User.objects.filter(id__in=chat_partner_ids).select_related("profile")

        threads = []
        for partner in partners:
            # Get latest message
            last_msg = (
                messages.filter(
                    (Q(sender=user) & Q(recipient=partner))
                    | (Q(sender=partner) & Q(recipient=user))
                )
                .order_by("-created_at")
                .first()
            )

            # Count unread messages sent by this partner to the current user
            unread_count = messages.filter(
                sender=partner,
                recipient=user,
                is_read=False,
            ).count()

            threads.append(
                {
                    "user": UserSerializer(partner).data,
                    "last_message": DirectMessageSerializer(last_msg).data if last_msg else None,
                    "unread_count": unread_count,
                }
            )

        # Order threads by latest message created_at desc
        threads.sort(
            key=lambda x: x["last_message"]["created_at"] if x["last_message"] else "",
            reverse=True,
        )

        return Response(threads)


class UserListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Exclude current user from the list
        users = User.objects.exclude(id=request.user.id).select_related("profile")
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)



# Create your views here.
