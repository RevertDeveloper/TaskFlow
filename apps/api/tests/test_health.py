from django.test import Client


def test_health_reports_live_process() -> None:
    response = Client().get("/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}