from rest_framework import serializers

from live.models import Comment, LiveSession, Reaction
from users.serializers import UserSerializer


class LiveSessionSerializer(serializers.ModelSerializer):
    creator = UserSerializer(read_only=True)
    comment_count = serializers.SerializerMethodField()
    heart_count = serializers.SerializerMethodField()

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
            "viewer_count_live",
            "total_view_count",
            "thumbnail",
            "created_at",
            "comment_count",
            "heart_count",
        ]

    def get_comment_count(self, obj):
        annotated_count = getattr(obj, "comment_count_annotated", None)
        if annotated_count is not None:
            return annotated_count
        return obj.comments.filter(is_deleted=False).count()

    def get_heart_count(self, obj):
        annotated_count = getattr(obj, "heart_count_annotated", None)
        if annotated_count is not None:
            return annotated_count
        return obj.reactions.filter(type=Reaction.Type.HEART).count()


class StartLiveSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    thumbnail = serializers.FileField(required=False, allow_null=True)


class LiveTokenRequestSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["creator", "viewer"], default="viewer")


class CommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=Comment.objects.all(),
        source="parent",
        required=False,
        allow_null=True,
        write_only=False,
    )

    class Meta:
        model = Comment
        fields = ["id", "session", "user", "body", "parent_id", "is_deleted", "created_at"]
        read_only_fields = ["id", "session", "user", "is_deleted", "created_at"]


class CreateCommentSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=500)
    parent_id = serializers.IntegerField(required=False, allow_null=True)


class ReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reaction
        fields = ["id", "session", "user", "type", "created_at"]
        read_only_fields = ["id", "session", "user", "created_at"]


class CreateReactionSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=[Reaction.Type.HEART], default=Reaction.Type.HEART)
