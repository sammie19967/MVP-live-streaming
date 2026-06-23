from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)
    is_creator = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    display_name = models.CharField(max_length=120, blank=True)
    avatar_url = models.URLField(blank=True)
    bio = models.TextField(blank=True)

    def __str__(self):
        return self.display_name or self.user.username


class Follow(models.Model):
    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="following_relationships",
    )
    following = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="follower_relationships",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "following"],
                name="unique_follow_relationship",
            )
        ]

    def clean(self):
        if self.follower_id == self.following_id:
            raise ValidationError("Users cannot follow themselves.")


class DirectMessage(models.Model):
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_dms",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_dms",
    )
    body = models.TextField(max_length=1000, blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    attachment = models.FileField(upload_to="dm_attachments/", null=True, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True)
    attachment_content_type = models.CharField(max_length=120, blank=True)
    attachment_size = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"From {self.sender} to {self.recipient}: {self.body[:30]}"

# Create your models here.
