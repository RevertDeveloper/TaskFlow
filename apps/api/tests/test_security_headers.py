import pytest
from django.test import Client, override_settings

pytestmark = pytest.mark.django_db


@override_settings(
    SECURE_HSTS_SECONDS=31_536_000,
    SECURE_HSTS_INCLUDE_SUBDOMAINS=True,
    SECURE_HSTS_PRELOAD=True,
    SECURE_CONTENT_TYPE_NOSNIFF=True,
    SECURE_REFERRER_POLICY="same-origin",
    X_FRAME_OPTIONS="DENY",
    SECURE_CROSS_ORIGIN_OPENER_POLICY="same-origin",
)
def test_production_security_headers_are_emitted_for_https_requests() -> None:
    response = Client().get("/api/health", secure=True)

    assert response.status_code == 200
    assert response["Strict-Transport-Security"] == (
        "max-age=31536000; includeSubDomains; preload"
    )
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Referrer-Policy"] == "same-origin"
    assert response["X-Frame-Options"] == "DENY"
    assert response["Cross-Origin-Opener-Policy"] == "same-origin"


def test_taskflow_csrf_cookie_has_explicit_cross_site_protection() -> None:
    response = Client().get("/api/v1/auth/csrf/", secure=True)

    assert response.status_code == 200
    cookie = response.cookies["taskflowcsrftoken"]
    assert cookie["samesite"] == "Lax"
    assert cookie["httponly"] == ""