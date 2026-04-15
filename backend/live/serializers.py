from rest_framework import serializers

from live.models import LiveSession
from users.serializers import UserSerializer


class LiveSessionSerializer(serializers.ModelSerializer):
    creator = UserSerializer(read_only=True)

    class Meta:
        model = LiveSession
        fields = [
            "id",
            "creator",
            "title",
            "status",
            "livekit_room_name",
            "started_at",
            "ended_at",
            "viewer_count_cached",
            "thumbnail_url",
            "created_at",
        ]


class StartLiveSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    thumbnail_url = serializers.URLField(required=False, allow_blank=True)


class LiveTokenRequestSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["creator", "viewer"], default="viewer")
