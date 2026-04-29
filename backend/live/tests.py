from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from live.middleware import TokenAuthMiddleware
from live.models import Comment, LiveSession, Reaction
from live.serializers import LiveSessionSerializer
from users.models import User


class LiveSessionTests(APITestCase):
    def setUp(self):
        self.creator = User.objects.create_user(
            username="streamer",
            email="streamer@example.com",
            password="supersecret123",
        )
        self.viewer = User.objects.create_user(
            username="viewer",
            email="viewer@example.com",
            password="supersecret123",
        )

    def test_creator_can_start_live_session(self):
        self.client.force_authenticate(user=self.creator)

        response = self.client.post(
            "/api/live/start",
            {"title": "First Live"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], LiveSession.Status.LIVE)
        self.assertEqual(LiveSession.objects.count(), 1)

    def test_viewer_can_request_viewer_token(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Open Room",
            status=LiveSession.Status.LIVE,
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.post(
            f"/api/live/{session.id}/token",
            {"role": "viewer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["room_name"], session.livekit_room_name)
        self.assertEqual(response.data["role"], "viewer")
        self.assertIn("token", response.data)

    def test_viewer_cannot_request_token_for_ended_session(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Ended Room",
            status=LiveSession.Status.ENDED,
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.post(
            f"/api/live/{session.id}/token",
            {"role": "viewer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Tokens are only issued for active live sessions.",
        )

    def test_authenticated_user_can_post_comment(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Commentable Live",
            status=LiveSession.Status.LIVE,
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.post(
            f"/api/live/{session.id}/comments",
            {"body": "Hello streamer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["body"], "Hello streamer")
        self.assertTrue(Comment.objects.filter(session=session, user=self.viewer).exists())

    def test_authenticated_user_can_send_heart_reaction(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Reactable Live",
            status=LiveSession.Status.LIVE,
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.post(
            f"/api/live/{session.id}/reactions",
            {"type": "heart"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["heart_count"], 1)
        self.assertTrue(
            Reaction.objects.filter(
                session=session,
                user=self.viewer,
                type=Reaction.Type.HEART,
            ).exists()
        )

    def test_live_detail_includes_annotated_counts(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Counted Live",
            status=LiveSession.Status.LIVE,
        )
        Comment.objects.create(session=session, user=self.viewer, body="visible")
        deleted_comment = Comment.objects.create(session=session, user=self.creator, body="hidden")
        deleted_comment.is_deleted = True
        deleted_comment.save(update_fields=["is_deleted"])
        Reaction.objects.create(
            session=session,
            user=self.viewer,
            type=Reaction.Type.HEART,
        )

        response = self.client.get(f"/api/live/{session.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["comment_count"], 1)
        self.assertEqual(response.data["heart_count"], 1)


class TokenAuthMiddlewareTests(SimpleTestCase):
    def test_extracts_bearer_token_from_headers(self):
        middleware = TokenAuthMiddleware(lambda scope, receive, send: None)
        scope = {"headers": [(b"authorization", b"Bearer abc123")]}

        token = middleware._get_token_from_headers(scope)

        self.assertEqual(token, "abc123")

    def test_rejects_malformed_authorization_header(self):
        middleware = TokenAuthMiddleware(lambda scope, receive, send: None)
        scope = {"headers": [(b"authorization", b"Bearer")]}

        token = middleware._get_token_from_headers(scope)

        self.assertIsNone(token)


class LiveSessionSerializerTests(APITestCase):
    def test_serializer_uses_annotated_counts_when_available(self):
        creator = User.objects.create_user(
            username="annotated-streamer",
            email="annotated-streamer@example.com",
            password="supersecret123",
        )
        viewer = User.objects.create_user(
            username="annotated-viewer",
            email="annotated-viewer@example.com",
            password="supersecret123",
        )
        session = LiveSession.objects.create(
            creator=creator,
            title="Annotated Live",
            status=LiveSession.Status.LIVE,
        )
        Comment.objects.create(session=session, user=viewer, body="hello")
        Reaction.objects.create(session=session, user=viewer, type=Reaction.Type.HEART)

        session.comment_count_annotated = 7
        session.heart_count_annotated = 9
        data = LiveSessionSerializer(session).data

        self.assertEqual(data["comment_count"], 7)
        self.assertEqual(data["heart_count"], 9)
