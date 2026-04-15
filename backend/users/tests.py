from rest_framework import status
from rest_framework.test import APITestCase

from users.models import Follow, User


class AuthFlowTests(APITestCase):
    def test_register_returns_token_and_profile(self):
        response = self.client.post(
            "/api/auth/register",
            {
                "username": "creator1",
                "email": "creator1@example.com",
                "password": "supersecret123",
                "is_creator": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["username"], "creator1")
        self.assertTrue(User.objects.filter(username="creator1").exists())

    def test_follow_endpoint_creates_relationship(self):
        follower = User.objects.create_user(
            username="viewer1",
            email="viewer1@example.com",
            password="supersecret123",
        )
        target = User.objects.create_user(
            username="creator2",
            email="creator2@example.com",
            password="supersecret123",
        )
        self.client.force_authenticate(user=follower)

        response = self.client.post(f"/api/users/{target.id}/follow", format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Follow.objects.filter(follower=follower, following=target).exists()
        )
