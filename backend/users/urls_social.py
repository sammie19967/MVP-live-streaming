from django.urls import path

from users.views import DirectMessageView, FollowUserView, DMThreadListView, UserListView

urlpatterns = [
    path("", UserListView.as_view(), name="user-list"),
    path("<int:user_id>/follow", FollowUserView.as_view(), name="follow-user"),
    path("dms/", DirectMessageView.as_view(), name="user-dms"),
    path("dms/threads/", DMThreadListView.as_view(), name="user-dm-threads"),
]
