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
        token_key = self._get_token_from_headers(scope) or query_params.get("token", [None])[0]
        scope["user"] = await get_user_for_token(token_key)
        return await self.app(scope, receive, send)

    def _get_token_from_headers(self, scope):
        for header_name, header_value in scope.get("headers", []):
            if header_name != b"authorization":
                continue

            try:
                decoded_value = header_value.decode("utf-8")
            except UnicodeDecodeError:
                return None

            parts = decoded_value.split()
            if len(parts) != 2:
                return None

            scheme, token = parts
            if scheme.lower() not in {"token", "bearer"}:
                return None
            return token

        return None


def TokenAuthMiddlewareStack(inner):
    return TokenAuthMiddleware(inner)
