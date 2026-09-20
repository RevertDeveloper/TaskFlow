import hmac
import os
import re
from time import perf_counter

from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.views.decorators.http import require_GET
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

_UUID_SEGMENT = re.compile(
    r"/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(?=/|$)"
)

HTTP_REQUESTS = Counter(
    "taskflow_http_requests_total",
    "HTTP requests completed by TaskFlow.",
    ("method", "path", "status"),
)
HTTP_REQUEST_DURATION = Histogram(
    "taskflow_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ("method", "path"),
)
ACCOUNTS_VALIDATIONS = Counter(
    "taskflow_accounts_validations_total",
    "Accounts session validation outcomes.",
    ("outcome",),
)
SYNC_OPERATIONS = Counter(
    "taskflow_sync_operations_total",
    "Synchronization operations by result.",
    ("result",),
)
VOICE_TRANSCRIPTIONS = Counter(
    "taskflow_voice_transcriptions_total",
    "Voice transcription outcomes.",
    ("provider", "result"),
)
VOICE_PROVIDER_DURATION = Histogram(
    "taskflow_voice_provider_duration_seconds",
    "Voice provider call duration in seconds.",
    ("provider", "result"),
)


def metric_path(request: HttpRequest) -> str:
    resolver_match = getattr(request, "resolver_match", None)
    route = getattr(resolver_match, "route", None)
    if route:
        return str(route)
    return _UUID_SEGMENT.sub("/{id}", request.path)


def observe_http_request(request: HttpRequest, status_code: int, started_at: float) -> None:
    path = metric_path(request)
    method = request.method
    HTTP_REQUESTS.labels(method=method, path=path, status=str(status_code)).inc()
    HTTP_REQUEST_DURATION.labels(method=method, path=path).observe(perf_counter() - started_at)


def observe_accounts_validation(outcome: str) -> None:
    ACCOUNTS_VALIDATIONS.labels(outcome=outcome).inc()


def observe_sync_result(result: str) -> None:
    SYNC_OPERATIONS.labels(result=result).inc()


def observe_voice_provider(provider: str, result: str, duration_seconds: float) -> None:
    VOICE_TRANSCRIPTIONS.labels(provider=provider, result=result).inc()
    VOICE_PROVIDER_DURATION.labels(provider=provider, result=result).observe(duration_seconds)


@require_GET
def metrics(request: HttpRequest) -> HttpResponse:
    configured_token = getattr(settings, "TASKFLOW_METRICS_TOKEN", "") or os.getenv(
        "TASKFLOW_METRICS_TOKEN", ""
    )
    provided_token = request.headers.get("X-Metrics-Token", "")
    if not configured_token or not hmac.compare_digest(provided_token, configured_token):
        return HttpResponse("forbidden", status=403, content_type="text/plain")
    return HttpResponse(generate_latest(), content_type=CONTENT_TYPE_LATEST)
