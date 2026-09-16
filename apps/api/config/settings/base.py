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
    "apps.common.apps.CommonConfig",
    "apps.lists.apps.ListsConfig",
    "apps.tasks.apps.TasksConfig",
    "apps.history.apps.HistoryConfig",
    "apps.sync.apps.SyncConfig",
    "apps.voice.apps.VoiceConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

# TaskFlow has its own CSRF boundary; Accounts' CSRF cookie is never validated
# with TaskFlow secrets.
CSRF_COOKIE_NAME = "taskflowcsrftoken"

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
    "EXCEPTION_HANDLER": "apps.common.api.taskflow_exception_handler",
}