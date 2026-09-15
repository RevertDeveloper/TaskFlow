from django.urls import resolve


def test_verification_resend_route_matches_accounts_contract() -> None:
    match = resolve("/api/accounts/verify-email/resend/")

    assert match.kwargs == {"route": "verify-email-resend"}