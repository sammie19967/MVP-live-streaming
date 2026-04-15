from django.contrib import admin

from live.models import Comment, LiveSession, Reaction


@admin.register(LiveSession)
class LiveSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "creator", "title", "status", "started_at", "ended_at")
    search_fields = ("title", "creator__username", "livekit_room_name")
    list_filter = ("status",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "user", "is_deleted", "created_at")
    search_fields = ("body", "user__username", "session__title")
    list_filter = ("is_deleted",)


@admin.register(Reaction)
class ReactionAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "user", "type", "created_at")
    search_fields = ("user__username", "session__title")
    list_filter = ("type",)
