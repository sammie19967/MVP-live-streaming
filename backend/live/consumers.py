from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from django.core.cache import cache
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


class LiveRoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = live_session_group_name(self.session_id)

        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        if not await self.session_exists(self.session_id):
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.increment_viewer_count()
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            await self.decrement_viewer_count()

    @database_sync_to_async
    def increment_viewer_count(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            return

        cache_key = f"presence_{self.session_id}_{user.id}"
        # Increment connection count for this user in this session (TTL 2 hours)
        new_count = cache.get(cache_key, 0) + 1
        cache.set(cache_key, new_count, timeout=7200)

        # If this is the first connection for this user, increment the global session count
        if new_count == 1:
            LiveSession.objects.filter(id=self.session_id).update(
                viewer_count_cached=F("viewer_count_cached") + 1
            )
            broadcast_session_update(self.session_id)

    @database_sync_to_async
    def decrement_viewer_count(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            return

        cache_key = f"presence_{self.session_id}_{user.id}"
        count = cache.get(cache_key, 0)
        
        if count <= 1:
            cache.delete(cache_key)
            # Only decrement if the user is truly leaving (last tab closed)
            if count == 1:
                # Ensure we don't go below 0
                LiveSession.objects.filter(
                    id=self.session_id, 
                    viewer_count_cached__gt=0
                ).update(
                    viewer_count_cached=F("viewer_count_cached") - 1
                )
                broadcast_session_update(self.session_id)
        else:
            cache.set(cache_key, count - 1, timeout=7200)

    async def comment_created(self, event):
        await self.send_json(event["payload"])

    async def reaction_created(self, event):
        await self.send_json(event["payload"])

    async def session_updated(self, event):
        await self.send_json(event["payload"])

    async def session_ended(self, event):
        await self.send_json(event["payload"])

    @database_sync_to_async
    def session_exists(self, session_id):
        return LiveSession.objects.filter(id=session_id).exists()
