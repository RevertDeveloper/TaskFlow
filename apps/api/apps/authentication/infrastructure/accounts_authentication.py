from collections.abc import Mapping

from django.middleware.csrf import CsrfViewMiddleware, get_token
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import APIException, PermissionDenied

from .accounts_client import AccountsSessionClient, AccountsUnavailableError


class AccountsUnavailable(APIException):
    status_code = 503
    default_detail = "El servicio de identidad no está disponible."
    default_code = "accounts_unavailable"


class AccountsSessionAuthentication(BaseAuthentication):
    """Revalidates the Accounts session for every API request."""

    def __init__(self, client: AccountsSessionClient | None = None) -> None:
        self.client = client or AccountsSessionClient()

    def authenticate(self, request):  # type: ignore[no-untyped-def]
        try:
            principal = self.client.get_current_user(_request_headers(request))
        except AccountsUnavailableError as exc:
            raise AccountsUnavailable() from exc
        if principal is None:
            return None
        self.enforce_csrf(request)
        return principal, None

    def authenticate_header(self, request):  # type: ignore[no-untyped-def]
        return "Session"

    def enforce_csrf(self, request) -> None:  # type: ignore[no-untyped-def]
        if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            return
        django_request = request._request
        reason = CsrfViewMiddleware(lambda _: None).process_view(
            django_request, lambda _: None, (), {}
        )
        if reason:
            raise PermissionDenied("CSRF Failed")
        get_token(django_request)


def _request_headers(request) -> Mapping[str, str]:  # type: ignore[no-untyped-def]
    return request.headers