import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

DEBUG = False

if SECRET_KEY == "development-only-key" or len(SECRET_KEY) < 50:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be at least 50 characters in production")

ALLOWED_HOSTS = [*ALLOWED_HOSTS, "api", "localhost", "127.0.0.1"]  # noqa: F405

if not ALLOWED_HOSTS:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must contain at least one host")

public_url = os.getenv("TASKFLOW_PUBLIC_URL", "").rstrip("/")
if not public_url.startswith("https://"):
    raise ImproperlyConfigured("TASKFLOW_PUBLIC_URL must use HTTPS in production")

if os.getenv("DJANGO_ALLOWED_HOSTS", "").strip() in {"", "localhost", "127.0.0.1"}:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must contain the production hostname")
if not os.getenv("TASKFLOW_METRICS_TOKEN"):
    raise ImproperlyConfigured("TASKFLOW_METRICS_TOKEN is required in production")

CSRF_TRUSTED_ORIGINS = [public_url]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
USE_X_FORWARDED_HOST = True

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
