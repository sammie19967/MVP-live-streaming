from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import DirectMessage, Follow, User


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


class DirectMessageTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="supersecret123",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="supersecret123",
        )
        self.cara = User.objects.create_user(
            username="cara",
            email="cara@example.com",
            password="supersecret123",
        )

    def test_authenticated_user_can_send_dm(self):
        self.client.force_authenticate(user=self.alice)

        response = self.client.post(
            "/api/users/dms/",
            {"recipient_id": self.bob.id, "body": "  hello bob  "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["body"], "hello bob")
        self.assertEqual(response.data["sender"]["id"], self.alice.id)
        self.assertEqual(response.data["recipient"]["id"], self.bob.id)

    def test_dm_history_only_includes_selected_conversation_and_marks_read(self):
        DirectMessage.objects.create(sender=self.alice, recipient=self.bob, body="one")
        unread = DirectMessage.objects.create(
            sender=self.bob,
            recipient=self.alice,
            body="two",
        )
        DirectMessage.objects.create(sender=self.cara, recipient=self.alice, body="outside")
        self.client.force_authenticate(user=self.alice)

        response = self.client.get(f"/api/users/dms/?with_user_id={self.bob.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([message["body"] for message in response.data], ["one", "two"])
        unread.refresh_from_db()
        self.assertTrue(unread.is_read)

    def test_dm_threads_include_latest_message_and_unread_count(self):
        older = DirectMessage.objects.create(sender=self.alice, recipient=self.bob, body="older")
        newer = DirectMessage.objects.create(sender=self.bob, recipient=self.alice, body="newer")
        other = DirectMessage.objects.create(sender=self.cara, recipient=self.alice, body="other")
        base_time = timezone.now()
        DirectMessage.objects.filter(id=older.id).update(created_at=base_time)
        DirectMessage.objects.filter(id=newer.id).update(created_at=base_time + timedelta(seconds=1))
        DirectMessage.objects.filter(id=other.id).update(created_at=base_time + timedelta(seconds=2))
        self.client.force_authenticate(user=self.alice)

        response = self.client.get("/api/users/dms/threads/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["user"]["id"], self.cara.id)
        bob_thread = next(thread for thread in response.data if thread["user"]["id"] == self.bob.id)
        self.assertEqual(bob_thread["last_message"]["body"], "newer")
        self.assertEqual(bob_thread["unread_count"], 1)

    def test_user_cannot_send_dm_to_self(self):
        self.client.force_authenticate(user=self.alice)

        response = self.client.post(
            "/api/users/dms/",
            {"recipient_id": self.alice.id, "body": "note to self"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_blank_dm_body_is_rejected(self):
        self.client.force_authenticate(user=self.alice)

        response = self.client.post(
            "/api/users/dms/",
            {"recipient_id": self.bob.id, "body": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
