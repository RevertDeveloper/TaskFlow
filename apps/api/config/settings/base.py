import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parents[2]
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "development-only-key")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [
    host for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host
]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "apps.common.apps.CommonConfig",
    "apps.lists.apps.ListsConfig",
    "apps.tasks.apps.TasksConfig",
    "apps.history.apps.HistoryConfig",
    "apps.sync.apps.SyncConfig",
    "apps.voice.apps.VoiceConfig",
]

MIDDLEWARE = [
    "apps.common.middleware.RequestCorrelationMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

# TaskFlow has its own CSRF boundary; Accounts' CSRF cookie is never validated
# with TaskFlow secrets.
CSRF_COOKIE_NAME = "taskflowcsrftoken"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "apps.common.middleware.RequestIdLogFilter"}},
    "formatters": {"json": {"()": "apps.common.middleware.JsonLogFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["request_id"],
            "formatter": "json",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


def database_config() -> dict[str, object]:
    database_url = os.getenv("DATABASE_URL", "sqlite:///" + str(BASE_DIR / "db.sqlite3"))
    parsed = urlparse(database_url)

    if parsed.scheme in {"postgres", "postgresql"}:
        options = parse_qs(parsed.query)
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": unquote(parsed.path.removeprefix("/")),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "localhost",
            "PORT": str(parsed.port or 5432),
            "OPTIONS": {key: values[-1] for key, values in options.items()},
        }

    if parsed.scheme == "sqlite":
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": parsed.path}

    raise ValueError("DATABASE_URL must use postgres, postgresql, or sqlite")


DATABASES = {"default": database_config()}

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"

AI_PROVIDER = os.getenv("AI_PROVIDER", "fake")
AI_MAX_AUDIO_SECONDS = float(os.getenv("AI_MAX_AUDIO_SECONDS", "300"))
AI_MAX_AUDIO_BYTES = int(os.getenv("AI_MAX_AUDIO_BYTES", "25000000"))
AI_MAX_TRANSCRIPT_CHARS = int(os.getenv("AI_MAX_TRANSCRIPT_CHARS", "100000"))
AI_AUDIO_TEMP_DIR = Path(
    os.getenv("AI_AUDIO_TEMP_DIR", str(BASE_DIR / "var" / "audio"))
).expanduser()
AI_STT_PROVIDER = os.getenv("AI_STT_PROVIDER") or AI_PROVIDER
AI_LLM_PROVIDER = os.getenv("AI_LLM_PROVIDER") or AI_PROVIDER
AI_STT_TASK_MAX_RETRIES = int(os.getenv("AI_STT_TASK_MAX_RETRIES", "2"))
AI_LLM_MAX_RETRIES = int(os.getenv("AI_LLM_MAX_RETRIES", "1"))
AI_MAX_LLM_RESPONSE_CHARS = int(os.getenv("AI_MAX_LLM_RESPONSE_CHARS", "20000"))

ACCOUNTS_APPLICATION_SLUG = os.getenv("ACCOUNTS_APPLICATION_SLUG", "taskflow")
ACCOUNTS_TASKFLOW_SERVICE_KEY = os.getenv("ACCOUNTS_TASKFLOW_SERVICE_KEY", "")
ACCOUNTS_QUOTA_MODE = os.getenv("ACCOUNTS_QUOTA_MODE", "accounts")

AUTH_PASSWORD_VALIDATORS: list[dict[str, object]] = []
LANGUAGE_CODE = "es"
TIME_ZONE = os.getenv("TIME_ZONE", "Europe/Madrid")
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.authentication.infrastructure.accounts_authentication.AccountsSessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.AllowAny",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.api.taskflow_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "TaskFlow API",
    "DESCRIPTION": "API versionada para listas, tareas e historial de TaskFlow.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
