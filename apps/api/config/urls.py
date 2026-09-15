from django.urls import path

from config.health import health

urlpatterns = [
    path("health/", health, name="health"),
]