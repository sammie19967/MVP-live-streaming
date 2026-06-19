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

    def test_nested_replies_do_not_flatten(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Nested comments live",
            status=LiveSession.Status.LIVE,
        )
        # Create root comment
        root_comment = Comment.objects.create(
            session=session,
            user=self.creator,
            body="Root comment",
        )
        # Create reply level 1
        reply_1 = Comment.objects.create(
            session=session,
            user=self.viewer,
            body="Reply 1",
            parent=root_comment,
        )

        # Authenticate and post reply level 2 (replying to reply 1)
        self.client.force_authenticate(user=self.viewer)
        response = self.client.post(
            f"/api/live/{session.id}/comments",
            {"body": "Reply 2", "parent_id": reply_1.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["parent_id"], reply_1.id)
        
        # Verify it wasn't flattened to root_comment
        reply_2_db = Comment.objects.get(id=response.data["id"])
        self.assertEqual(reply_2_db.parent_id, reply_1.id)

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

    def test_feed_can_be_filtered_by_status(self):
        # Create active sessions
        LiveSession.objects.create(
            creator=self.creator,
            title="Active 1",
            status=LiveSession.Status.LIVE,
        )
        # Create ended sessions
        LiveSession.objects.create(
            creator=self.creator,
            title="Ended 1",
            status=LiveSession.Status.ENDED,
        )

        # Query active feed (default)
        response = self.client.get("/api/live/feed")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(all(item["status"] == "live" for item in response.data))

        # Query ended feed
        response = self.client.get("/api/live/feed?status=ended")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(all(item["status"] == "ended" for item in response.data))
        self.assertTrue(any(item["title"] == "Ended 1" for item in response.data))

    def test_ending_live_session_resets_viewer_count_to_zero(self):
        session = LiveSession.objects.create(
            creator=self.creator,
            title="Session to End",
            status=LiveSession.Status.LIVE,
            viewer_count_live=15,
        )
        self.client.force_authenticate(user=self.creator)

        response = self.client.post(f"/api/live/{session.id}/end")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        session.refresh_from_db()
        self.assertEqual(session.status, LiveSession.Status.ENDED)
        self.assertEqual(session.viewer_count_live, 0)
        self.assertEqual(response.data["viewer_count_live"], 0)


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

    def test_serializer_computes_duration_seconds(self):
        from django.utils import timezone
        from datetime import timedelta
        
        creator = User.objects.create_user(
            username="duration-streamer",
            email="duration-streamer@example.com",
            password="supersecret123",
        )
        now = timezone.now()
        session = LiveSession.objects.create(
            creator=creator,
            title="Duration Room",
            status=LiveSession.Status.ENDED,
            started_at=now - timedelta(minutes=45),
            ended_at=now,
        )
        
        data = LiveSessionSerializer(session).data
        self.assertEqual(data["duration_seconds"], 45 * 60)
