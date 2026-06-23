from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

from users.presence import mark_user_offline, mark_user_online


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user_id = user.id
        self.group_name = f"user_chat_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.mark_online()
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "user_id"):
            await self.mark_offline()

    async def dm_created(self, event):
        # This handler sends the event payload (containing the DM details)
        # down to the WebSocket client.
        await self.send_json(event["payload"])

    @database_sync_to_async
    def mark_online(self):
        mark_user_online(self.user_id)

    @database_sync_to_async
    def mark_offline(self):
        mark_user_offline(self.user_id)
