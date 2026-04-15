from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from live.models import LiveSession
from live.realtime import live_feed_group_name, live_session_group_name


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
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

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
