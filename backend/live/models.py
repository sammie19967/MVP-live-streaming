import uuid

from django.conf import settings
from django.db import models


class LiveSession(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"

    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="live_sessions",
    )
    title = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    livekit_room_name = models.CharField(max_length=255, unique=True, editable=False)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    viewer_count_cached = models.PositiveIntegerField(default=0)
    thumbnail_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at", "-created_at"]

    def save(self, *args, **kwargs):
        if not self.livekit_room_name:
            suffix = uuid.uuid4().hex[:8]
            self.livekit_room_name = f"live-{self.creator_id}-{suffix}"
        super().save(*args, **kwargs)

# Create your models here.
