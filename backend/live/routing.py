from django.urls import re_path

from live.consumers import FeedConsumer, LiveRoomConsumer
from users.consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r"ws/live/feed/$", FeedConsumer.as_asgi()),
    re_path(r"ws/live/sessions/(?P<session_id>\d+)/$", LiveRoomConsumer.as_asgi()),
    re_path(r"ws/chat/$", ChatConsumer.as_asgi()),
]

