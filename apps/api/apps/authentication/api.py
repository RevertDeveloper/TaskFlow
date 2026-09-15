from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain.models import AuthenticatedPrincipal
from .infrastructure.accounts_auth_proxy import AccountsAuthProxy, AccountsProxyError


class CsrfView(APIView):
    permission_classes = (AllowAny,)

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):  # type: ignore[no-untyped-def]
        return Response({"detail": "CSRF cookie set"})


class MeView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):  # type: ignore[no-untyped-def]
        principal = request.user
        if not isinstance(principal, AuthenticatedPrincipal):
            return Response({"authenticated": False, "user": None})
        return Response({"authenticated": True, "user": principal_payload(principal)})


class AccountsAuthProxyView(APIView):
    permission_classes = (AllowAny,)
    proxy = AccountsAuthProxy()

    def dispatch(self, request, *args, **kwargs):  # type: ignore[no-untyped-def]
        try:
            return super().dispatch(request, *args, **kwargs)
        except AccountsProxyError as exc:
            return Response({"detail": str(exc)}, status=503)

    def get(self, request, route: str):  # type: ignore[no-untyped-def]
        return self._forward(request, route)

    def post(self, request, route: str):  # type: ignore[no-untyped-def]
        return self._forward(request, route)

    def _forward(self, request, route: str):  # type: ignore[no-untyped-def]
        try:
            upstream = self.proxy.forward(route, request.method, request.body, request.headers)
        except ValueError:
            return Response({"detail": "Unsupported Accounts auth route"}, status=404)
        response = HttpResponse(
            content=upstream.body,
            status=upstream.status_code,
            content_type=upstream.content_type,
        )
        for cookie in upstream.set_cookie:
            response.cookies.load(cookie)
        response.headers["Cache-Control"] = "no-store"
        return response


def principal_payload(principal: AuthenticatedPrincipal) -> dict[str, object]:
    return {
        "id": principal.external_user_id,
        "username": principal.username,
        "email": principal.email,
        "email_verified": principal.email_verified,
        "first_name": principal.display_name,
        "last_name": "",
        "plan": principal.plan,
    }