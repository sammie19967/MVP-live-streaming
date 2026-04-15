from django.urls import path

from users.views import FollowUserView

urlpatterns = [
    path("<int:user_id>/follow", FollowUserView.as_view(), name="follow-user"),
]
