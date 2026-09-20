import logging

from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

logger = logging.getLogger(__name__)


@extend_schema(operation_id="health_live", responses={200: OpenApiTypes.OBJECT})
@require_GET
def health(request):
    del request
    return JsonResponse({"status": "ok"})


@extend_schema(
    operation_id="health_ready",
    responses={200: OpenApiTypes.OBJECT, 503: OpenApiTypes.OBJECT},
)
@require_GET
def readiness(request):
    del request
    checks = {
        "configuration": _configuration_ready(),
        "database": False,
        "migrations": False,
    }
    if checks["configuration"]:
        checks["database"] = _database_ready()
    if checks["database"]:
        checks["migrations"] = _migrations_ready()

    ready = all(checks.values())
    if not ready:
        logger.warning("readiness_failed")
    return JsonResponse(
        {"status": "ok" if ready else "unavailable", "ready": ready, "checks": checks},
        status=200 if ready else 503,
    )


def _configuration_ready() -> bool:
    database = settings.DATABASES.get("default", {})
    return bool(settings.SECRET_KEY and database.get("ENGINE"))


def _database_ready() -> bool:
    try:
        connection.ensure_connection()
    except Exception:
        logger.warning("readiness_database_failed")
        return False
    return True


def _migrations_ready() -> bool:
    try:
        executor = MigrationExecutor(connection)
        return not executor.migration_plan(executor.loader.graph.leaf_nodes())
    except Exception:
        logger.warning("readiness_migrations_failed")
        return False
