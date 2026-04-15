from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token


@database_sync_to_async
def get_user_for_token(token_key):
    if not token_key:
        return AnonymousUser()

    try:
        token = Token.objects.select_related("user").get(key=token_key)
    except Token.DoesNotExist:
        return AnonymousUser()

    return token.user


class TokenAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        query_params = parse_qs(scope["query_string"].decode())
        token_key = query_params.get("token", [None])[0]
        scope["user"] = await get_user_for_token(token_key)
        return await self.app(scope, receive, send)


def TokenAuthMiddlewareStack(inner):
    return TokenAuthMiddleware(inner)
