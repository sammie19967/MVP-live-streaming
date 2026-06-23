from django.contrib.auth import authenticate
from rest_framework import serializers

from users.models import DirectMessage, Follow, Profile, User
from users.presence import is_user_online


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["display_name", "avatar_url", "bio"]


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)
    follower_count = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()

    def get_follower_count(self, obj):
        return obj.follower_relationships.count()

    def get_is_online(self, obj):
        return is_user_online(obj.id)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "is_creator",
            "created_at",
            "profile",
            "follower_count",
            "is_online",
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password", "is_creator"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs["username"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid username or password.")
        attrs["user"] = user
        return attrs


class FollowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Follow
        fields = ["id", "follower", "following", "created_at"]
        read_only_fields = ["id", "follower", "created_at"]


class DirectMessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    recipient = UserSerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=DirectMessage.objects.all(),
        source="parent",
        required=False,
        allow_null=True,
        write_only=False,
    )
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = DirectMessage
        fields = [
            "id",
            "sender",
            "recipient",
            "body",
            "parent_id",
            "attachment",
            "attachment_url",
            "attachment_name",
            "attachment_content_type",
            "attachment_size",
            "created_at",
            "is_read",
        ]
        read_only_fields = [
            "id",
            "sender",
            "recipient",
            "attachment_url",
            "attachment_name",
            "attachment_content_type",
            "attachment_size",
            "created_at",
            "is_read",
        ]

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None

        request = self.context.get("request")
        url = obj.attachment.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url
