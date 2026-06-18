from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.cache.backends.base import InvalidCacheBackendError

from django.core.cache import cache
from django.db import DatabaseError
from live.models import LiveSession
from live.realtime import (
    broadcast_session_update,
    live_feed_group_name,
    live_session_group_name,
)
from django.db.models import F


class FeedConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add(live_feed_group_name(), self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(live_feed_group_name(), self.channel_name)

    async def session_started(self, event):
        await self.send_json(event["payload"])

    async def session_updated(self, event):
        await self.send_json(event["payload"])

    async def session_ended(self, event):
        await self.send_json(event["payload"])
        await self.close(code=4000)


class LiveRoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = live_session_group_name(self.session_id)
        self.viewer_count_incremented = False

        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        if not await self.session_is_live(self.session_id):
            await self.close(code=4404)
            return

        try:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            self.viewer_count_incremented = await self.increment_viewer_count()
        except (InvalidCacheBackendError, DatabaseError, ValueError):
            await self.close(code=1011)
            return

        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            if self.viewer_count_incremented:
                try:
                    await self.decrement_viewer_count()
                except (InvalidCacheBackendError, DatabaseError, ValueError):
                    return

    @database_sync_to_async
    def increment_viewer_count(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            return False

        presence_key = f"presence_{self.session_id}_{user.id}"
        joined_key = f"joined_{self.session_id}_{user.id}"

        # Redis-backed incr/decr avoids the race caused by separate get/set calls.
        if cache.add(presence_key, 1, timeout=7200):
            new_presence_count = 1
        else:
            new_presence_count = cache.incr(presence_key)
            cache.touch(presence_key, timeout=7200)

        if new_presence_count == 1:
            LiveSession.objects.filter(id=self.session_id).update(
                viewer_count_live=F("viewer_count_live") + 1,
                total_view_count=F("total_view_count") + 1
            )

            broadcast_session_update(self.session_id)

        return True

    @database_sync_to_async
    def decrement_viewer_count(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            return

        presence_key = f"presence_{self.session_id}_{user.id}"
        count = cache.get(presence_key)
        if count is None:
            return

        if count <= 1:
            cache.delete(presence_key)
            LiveSession.objects.filter(
                id=self.session_id,
                viewer_count_live__gt=0,
            ).update(
                viewer_count_live=F("viewer_count_live") - 1
            )
            broadcast_session_update(self.session_id)
            return

        cache.decr(presence_key)
        cache.touch(presence_key, timeout=7200)

    async def comment_created(self, event):
        await self.send_json(event["payload"])

    async def reaction_created(self, event):
        await self.send_json(event["payload"])

    async def session_updated(self, event):
        await self.send_json(event["payload"])

    async def session_ended(self, event):
        await self.send_json(event["payload"])

    @database_sync_to_async
    def session_is_live(self, session_id):
        return LiveSession.objects.filter(
            id=session_id,
            status=LiveSession.Status.LIVE,
        ).exists()
