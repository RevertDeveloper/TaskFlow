from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import Client

from apps.authentication.infrastructure.accounts_auth_proxy import AccountsProxyResponse

pytestmark = pytest.mark.django_db


def test_accounts_auth_proxy_is_rate_limited_by_client_identity() -> None:
    cache.clear()
    with patch(
        "apps.authentication.api.AccountsAuthProxy.forward",
        return_value=AccountsProxyResponse(200, b"{}", "application/json"),
    ):
        client = Client()
        responses = [
            client.post(
                "/api/accounts/login/",
                data="{}",
                content_type="application/json",
            )
            for _ in range(21)
        ]

    assert [response.status_code for response in responses[:20]] == [200] * 20
    assert responses[20].status_code == 429
    assert responses[20]["Retry-After"]
    cache.clear()