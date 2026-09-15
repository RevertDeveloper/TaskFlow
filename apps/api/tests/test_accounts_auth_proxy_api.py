from dataclasses import dataclass

from django.test import Client

from apps.authentication.api import AccountsAuthProxyView
from apps.authentication.infrastructure.accounts_auth_proxy import AccountsProxyResponse


@dataclass
class FakeProxy:
    calls: list[tuple[str, str, bytes, dict[str, str]]]

    def forward(self, route, method, body, headers):  # type: ignore[no-untyped-def]
        self.calls.append((route, method, body, dict(headers)))
        return AccountsProxyResponse(
            200,
            b'{"authenticated":true}',
            "application/json",
            ("sessionid=opaque; Path=/; HttpOnly", "csrftoken=csrf; Path=/"),
        )


def test_proxy_route_returns_upstream_body_and_cookies(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    proxy = FakeProxy([])
    monkeypatch.setattr(AccountsAuthProxyView, "proxy", proxy)

    response = Client().post(
        "/api/accounts/login/",
        data='{"identifier":"user@example.com"}',
        content_type="application/json",
        HTTP_COOKIE="sessionid=old",
        HTTP_X_CSRFTOKEN="csrf",
    )

    assert response.status_code == 200
    assert response.content == b'{"authenticated":true}'
    assert response["Cache-Control"] == "no-store"
    assert set(response.cookies) == {"sessionid", "csrftoken"}
    assert proxy.calls[0][0] == "login"
    assert proxy.calls[0][3]["Cookie"] == "sessionid=old"
    csrf_header = next(
        value for name, value in proxy.calls[0][3].items() if name.lower() == "x-csrftoken"
    )
    assert csrf_header == "csrf"