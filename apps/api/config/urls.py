from django.urls import path

from apps.authentication.api import AccountsAuthProxyView, CsrfView, MeView
from apps.history.api import HistoryView, ListHistoryView
from apps.lists.api import ListCollectionView, ListDetailView
from apps.tasks.api import (
    TaskCollectionView,
    TaskCompleteView,
    TaskDetailView,
    TaskReopenView,
)
from config.health import health

urlpatterns = [
    path("health/", health, name="health"),
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