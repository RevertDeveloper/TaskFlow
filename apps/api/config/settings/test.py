from .base import *  # noqa: F403

DEBUG = False
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False