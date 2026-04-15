from rest_framework import status
from rest_framework.test import APITestCase

from live.models import LiveSession
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
