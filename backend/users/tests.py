from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import DirectMessage, Follow, User
from users.presence import mark_user_online


TEST_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "users-tests",
    }
}


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

    def test_user_can_send_multilevel_dm_replies(self):
        root = DirectMessage.objects.create(
            sender=self.alice,
            recipient=self.bob,
            body="root",
        )
        first_reply = DirectMessage.objects.create(
            sender=self.bob,
            recipient=self.alice,
            body="reply",
            parent=root,
        )
        self.client.force_authenticate(user=self.alice)

        response = self.client.post(
            "/api/users/dms/",
            {
                "recipient_id": self.bob.id,
                "body": "nested reply",
                "parent_id": first_reply.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["parent_id"], first_reply.id)
        self.assertEqual(DirectMessage.objects.get(id=response.data["id"]).parent_id, first_reply.id)

    def test_dm_reply_parent_must_belong_to_same_thread(self):
        outside = DirectMessage.objects.create(
            sender=self.cara,
            recipient=self.alice,
            body="outside",
        )
        self.client.force_authenticate(user=self.alice)

        response = self.client.post(
            "/api/users/dms/",
            {
                "recipient_id": self.bob.id,
                "body": "wrong thread",
                "parent_id": outside.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_can_send_attachment_dm_without_body(self):
        self.client.force_authenticate(user=self.alice)
        attachment = SimpleUploadedFile(
            "reply.gif",
            b"GIF89a",
            content_type="image/gif",
        )

        response = self.client.post(
            "/api/users/dms/",
            {"recipient_id": self.bob.id, "attachment": attachment},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["body"], "")
        self.assertEqual(response.data["attachment_name"], "reply.gif")
        self.assertEqual(response.data["attachment_content_type"], "image/gif")
        self.assertEqual(response.data["attachment_size"], 6)
        self.assertTrue(response.data["attachment_url"])

    def test_user_can_send_document_attachment_with_reply(self):
        parent = DirectMessage.objects.create(
            sender=self.bob,
            recipient=self.alice,
            body="please review",
        )
        self.client.force_authenticate(user=self.alice)
        attachment = SimpleUploadedFile(
            "brief.pdf",
            b"%PDF-1.4",
            content_type="application/pdf",
        )

        response = self.client.post(
            "/api/users/dms/",
            {
                "recipient_id": self.bob.id,
                "body": "attached",
                "parent_id": parent.id,
                "attachment": attachment,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["parent_id"], parent.id)
        self.assertEqual(response.data["attachment_name"], "brief.pdf")
        self.assertEqual(response.data["attachment_content_type"], "application/pdf")


@override_settings(CACHES=TEST_CACHES)
class UserListPresenceTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="presence-alice",
            email="presence-alice@example.com",
            password="supersecret123",
        )
        self.bob = User.objects.create_user(
            username="presence-bob",
            email="presence-bob@example.com",
            password="supersecret123",
        )
        self.cara = User.objects.create_user(
            username="presence-cara",
            email="presence-cara@example.com",
            password="supersecret123",
        )

    def test_user_list_includes_online_flag(self):
        mark_user_online(self.bob.id)
        self.client.force_authenticate(user=self.alice)

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        bob = next(user for user in response.data if user["id"] == self.bob.id)
        cara = next(user for user in response.data if user["id"] == self.cara.id)
        self.assertTrue(bob["is_online"])
        self.assertFalse(cara["is_online"])

    def test_user_list_can_filter_to_online_users(self):
        mark_user_online(self.bob.id)
        self.client.force_authenticate(user=self.alice)

        response = self.client.get("/api/users/?online_only=1")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([user["id"] for user in response.data], [self.bob.id])
