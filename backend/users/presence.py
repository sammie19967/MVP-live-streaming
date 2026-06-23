from django.core.cache import cache

ONLINE_TIMEOUT_SECONDS = 90


def user_presence_key(user_id):
    return f"user_presence_{user_id}"


def mark_user_online(user_id):
    key = user_presence_key(user_id)
    if cache.add(key, 1, timeout=ONLINE_TIMEOUT_SECONDS):
        return

    cache.incr(key)
    cache.touch(key, timeout=ONLINE_TIMEOUT_SECONDS)


def mark_user_offline(user_id):
    key = user_presence_key(user_id)
    count = cache.get(key)
    if count is None:
        return

    if count <= 1:
        cache.delete(key)
        return

    cache.decr(key)
    cache.touch(key, timeout=ONLINE_TIMEOUT_SECONDS)


def is_user_online(user_id):
    return cache.get(user_presence_key(user_id)) is not None


def get_online_user_ids(user_ids):
    keys_by_user_id = {user_id: user_presence_key(user_id) for user_id in user_ids}
    online_keys = cache.get_many(keys_by_user_id.values())
    return {
        user_id
        for user_id, key in keys_by_user_id.items()
        if key in online_keys
    }
