from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def live_feed_group_name():
    return "live_feed"


def live_session_group_name(session_id):
    return f"live_session_{session_id}"


def _broadcast(group_name, event_type, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": event_type,
            "payload": payload,
        },
    )


def broadcast_feed_event(event_type, payload):
    _broadcast(live_feed_group_name(), event_type, payload)


def broadcast_room_event(session_id, event_type, payload):
    _broadcast(live_session_group_name(session_id), event_type, payload)
