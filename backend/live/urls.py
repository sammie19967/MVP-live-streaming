from django.urls import path

from live.views import (
    LiveCommentsView,
    LiveFeedView,
    LiveReactionsView,
    LiveSessionDetailView,
    LiveSessionEndView,
    LiveSessionTokenView,
    StartLiveSessionView,
)

urlpatterns = [
    path("feed", LiveFeedView.as_view(), name="live-feed"),
    path("start", StartLiveSessionView.as_view(), name="live-start"),
    path("<int:session_id>", LiveSessionDetailView.as_view(), name="live-detail"),
    path("<int:session_id>/comments", LiveCommentsView.as_view(), name="live-comments"),
    path("<int:session_id>/reactions", LiveReactionsView.as_view(), name="live-reactions"),
    path("<int:session_id>/end", LiveSessionEndView.as_view(), name="live-end"),
    path("<int:session_id>/token", LiveSessionTokenView.as_view(), name="live-token"),
]
