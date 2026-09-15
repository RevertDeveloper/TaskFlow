from django.urls import path

from apps.authentication.api import AccountsAuthProxyView, CsrfView, MeView
from config.health import health

urlpatterns = [
    path("health/", health, name="health"),
    path("api/v1/auth/csrf/", CsrfView.as_view(), name="taskflow-auth-csrf"),
    path("api/v1/auth/me/", MeView.as_view(), name="taskflow-auth-me"),
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