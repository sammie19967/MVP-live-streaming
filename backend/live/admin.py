from django.contrib import admin

from live.models import LiveSession


@admin.register(LiveSession)
class LiveSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "creator", "title", "status", "started_at", "ended_at")
    search_fields = ("title", "creator__username", "livekit_room_name")
    list_filter = ("status",)
