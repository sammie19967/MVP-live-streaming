from rest_framework import status
from rest_framework.test import APITestCase

from live.models import Comment, LiveSession, Reaction
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
