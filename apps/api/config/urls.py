from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.authentication.api import AccountsAuthProxyView, CsrfView, MeView
from apps.common.metrics import metrics
from apps.data_reset.api import ResetCloudView
from apps.history.api import HistoryView, ListHistoryView
from apps.lists.api import ListCollectionView, ListDetailView
from apps.notes.api import NoteCollectionView, NoteDetailView
from apps.sync.api import SyncPullView, SyncPushView
from apps.tasks.api import (
    TaskCollectionView,
    TaskCompleteView,
    TaskDetailView,
    TaskReopenView,
)
from apps.voice.api import (
    VoiceReviewConfirmView,
    VoiceReviewView,
    VoiceSessionCollectionView,
    VoiceSessionDetailView,
)
from config.health import health, readiness

urlpatterns = [
    path("health/", health, name="health"),
    path("api/health", health, name="api-health"),
    path("api/health/", health, name="api-health-slash"),
    path("api/ready", readiness, name="api-ready"),
    path("api/ready/", readiness, name="api-ready-slash"),
    path("api/metrics", metrics, name="api-metrics"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/auth/csrf/", CsrfView.as_view(), name="taskflow-auth-csrf"),
    path("api/v1/auth/me/", MeView.as_view(), name="taskflow-auth-me"),
    path("api/v1/lists/", ListCollectionView.as_view(), name="taskflow-lists"),
    path("api/v1/lists/<str:list_id>/", ListDetailView.as_view(), name="taskflow-list-detail"),
    path(
        "api/v1/lists/<str:list_id>/history/",
        ListHistoryView.as_view(),
        name="taskflow-list-history",
    ),
    path("api/v1/tasks/", TaskCollectionView.as_view(), name="taskflow-tasks"),
    path("api/v1/notes/", NoteCollectionView.as_view(), name="taskflow-notes"),
    path("api/v1/notes/<str:note_id>/", NoteDetailView.as_view(), name="taskflow-note-detail"),
    path("api/v1/tasks/<str:task_id>/", TaskDetailView.as_view(), name="taskflow-task-detail"),
    path(
        "api/v1/tasks/<str:task_id>/complete/",
        TaskCompleteView.as_view(),
        name="taskflow-task-complete",
    ),
    path(
        "api/v1/tasks/<str:task_id>/reopen/",
        TaskReopenView.as_view(),
        name="taskflow-task-reopen",
    ),
    path("api/v1/history/", HistoryView.as_view(), name="taskflow-history"),
    path("api/v1/sync/push/", SyncPushView.as_view(), name="taskflow-sync-push"),
    path("api/v1/sync/pull/", SyncPullView.as_view(), name="taskflow-sync-pull"),
    path("api/v1/data/reset/", ResetCloudView.as_view(), name="taskflow-data-reset"),
    path(
        "api/v1/voice/sessions/",
        VoiceSessionCollectionView.as_view(),
        name="taskflow-voice-sessions",
    ),
    path(
        "api/v1/voice/sessions/<str:session_id>/",
        VoiceSessionDetailView.as_view(),
        name="taskflow-voice-session-detail",
    ),
    path(
        "api/v1/voice/sessions/<str:session_id>/review/",
        VoiceReviewView.as_view(),
        name="taskflow-voice-review",
    ),
    path(
        "api/v1/voice/reviews/<str:draft_id>/confirm/",
        VoiceReviewConfirmView.as_view(),
        name="taskflow-voice-review-confirm",
    ),
    path(
        "api/accounts/verify-email/resend/",
        AccountsAuthProxyView.as_view(),
        {"route": "verify-email-resend"},
        name="accounts-auth-proxy-resend",
    ),
    path(
        "api/accounts/<str:route>/",
        AccountsAuthProxyView.as_view(),
        name="accounts-auth-proxy",
    ),
]
