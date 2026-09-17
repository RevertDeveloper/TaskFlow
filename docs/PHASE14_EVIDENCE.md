# Phase 14 - Evidencia de seguridad, rendimiento y fiabilidad

## Alcance

Esta evidencia cierra TF-1401 a TF-1408 con el codigo y los contratos disponibles
hasta Phase 14. Las pruebas HTTPS reales contra Accounts y el smoke de staging
siguen siendo responsabilidad de Phase 16.

## Quality gate

**Resultado: PASS en el alcance de desarrollo de Phase 14.**

No quedan hallazgos Critical/High sin control en el codigo revisado. Los
pendientes de staging estan identificados con owner y no bloquean esta fase.

## Auditoria de seguridad

| Tarea | Resultado | Evidencia |
| --- | --- | --- |
| TF-1401 auth, authorization y multi-tenancy | PASS | Accounts se revalida por request; ownership se aplica a API, sync, history, voice y reset; las pruebas de aislamiento estan en `apps/api/tests/test_api_resources.py`, `apps/api/tests/test_sync_api.py` y `apps/api/tests/test_voice_review.py`. Accounts unavailable y respuestas malformadas fallan cerrado con 503 en `apps/api/tests/test_accounts_authentication.py`. |
| TF-1402 CSRF, CORS, cookies y headers | PASS | POST cross-site bloqueado con CSRF valido en `apps/api/tests/test_api_resources.py`; headers de produccion en `apps/api/tests/test_security_headers.py`; `SameSite=Lax`, `HttpOnly` y la cookie CSRF legible estan declarados explicitamente en `apps/api/config/settings/base.py`; CSP y headers frontend en `apps/web/next.config.ts`. No se habilita CORS generico: la frontera es same-origin. |
| TF-1403 entradas y archivos | PASS | Validacion de MIME por contenido, tamano, duracion y cleanup de audio en `apps/api/tests/test_voice_infrastructure.py`; DRF/ORM parametrizado; rate limits de auth proxy, sync, voz y reset en `apps/api/tests/test_rate_limits.py` y las pruebas de recursos; no se renderiza HTML de tareas. |
| TF-1404 AI security | PASS | Transcript separado del system prompt, schema estricto, listas limitadas, repair retry acotado y metadata filtrada en `apps/api/tests/test_ai_extraction_contracts.py`, `apps/api/tests/test_ai_task_extraction.py` y `apps/api/tests/test_ai_quota.py`. |

### Riesgos residuales con owner

- HTTPS real, cookie compartida con Accounts y smoke cross-subdomain: owner
  deployment/Phase 16.
- CSP contiene `unsafe-inline` por compatibilidad con Next.js; owner frontend
  hardening/Phase 15 para evaluar nonce o hashes tras el build de produccion.
- No se introduce un circuit breaker global; las llamadas externas fallan
  cerrado, no se reintentan por defecto y el owner de una politica distribuida
  es infraestructura/Phase 16 si la operacion lo exige.

## Baseline de rendimiento

### API

Comando reproducible:

```text
docker compose -f compose.yaml -f compose.dev.yaml run --rm -e DJANGO_SETTINGS_MODULE=config.settings.test -e ACCOUNTS_QUOTA_MODE=fake api pytest tests/test_phase14_performance_baseline.py -s -q
```

Volumen: 20 listas, 1.000 tareas y 5.000 eventos.

```text
PHASE14_API_BASELINE {
  "dashboard": {"duration_ms": 159.04, "list_items": 20, "query_count": 7, "task_items": 100},
  "history": {"duration_ms": 3.2, "items": 100, "query_count": 2, "total_count": 5000},
  "tasks": {"duration_ms": 5.92, "items": 100, "query_count": 2, "total_count": 1000},
  "volume": {"events": 5000, "lists": 20, "tasks": 1000}
}
```

### IndexedDB

Comando reproducible:

```text
npx vitest run src/infrastructure/indexeddb/phase14-performance-baseline.test.ts --reporter=verbose --silent=false
```

Entorno: Vitest, jsdom y fake-indexeddb. Volumen: 1.000 tareas, 5.000
historias y 500 operaciones pendientes.

```text
PHASE14_INDEXEDDB_BASELINE {
  "cold_start_ms": 0.71,
  "crud_ms": 235.03,
  "crud_operations": 80,
  "history_first_page_ms": 2.4,
  "history_deep_page_ms": 46.37,
  "history_total_count": 5000,
  "sync_batch_count": 500,
  "sync_batch_ms": 7.5
}
```

No se fija un umbral artificial. La ruta global de historial ya no materializa
los 5.000 eventos: usa `count`, el indice `createdAt`, `offset` y `limit` para
la pagina solicitada. El caso profundo queda medido porque el coste de recorrer
el cursor crece con el offset; la primera pagina, que es la ruta habitual de la
UI, queda en 2,40 ms. La medicion real en navegador queda como seguimiento de
Phase 15.

El baseline de carga de sync del API tambien cubre 100 operaciones aceptadas
en `apps/api/tests/test_sync_load.py`.

## Politica de timeouts, retries y fallos

| Dependencia | Timeout | Retry | Fallo seguro |
| --- | --- | --- | --- |
| Accounts `/auth/me/` y proxy | 2 s configurable | 0 automatico | 503 o respuesta de proxy; respuesta malformada, redirect y error de transporte no autentican. |
| Accounts quota | 2 s configurable | 0 en el adapter HTTP | cuota fail-closed; reserva, validate, complete y fail usan request idempotente. |
| PostgreSQL | timeout gestionado por el driver/infraestructura | 0 en mutaciones HTTP | transacciones atomicas; readiness 503 sin detalles internos. |
| Redis/cache/broker | healthcheck Compose | 0 en mutaciones de dominio | fallback o estado de error; no se confirma una operacion que no haya quedado persistida. |
| STT/Celery | provider configurable | maximo 2 retries Celery, backoff 2 y 4 s | audio vuelve a `uploaded` durante retry; al agotar, sesion `failed` y cleanup. |
| LLM/extraccion | provider configurable | una reparacion acotada (`AI_LLM_MAX_RETRIES=1`) | schema invalido nunca produce tareas; la cuota termina en fail. |
| Cliente web | 8 s por defecto, configurable por request | 0 automatico | `408 request_timeout`; el timeout sigue activo aunque exista `AbortSignal` externo. |

Las mutaciones no se reintentan automaticamente sin clave de idempotencia. El
cliente web tampoco reintenta mutaciones por su cuenta.

## Data-loss drills

| Drill | Evidencia | Resultado |
| --- | --- | --- |
| IndexedDB commit interrumpido | `apps/web/src/infrastructure/repositories/LocalRepository.test.ts` | PASS: rollback y replay idempotente sin duplicados. |
| Cloud/Device interruption | `apps/web/src/application/storage/StorageManager.test.ts` y `apps/web/src/infrastructure/repositories/LocalReplica.test.ts` | PASS: fallback local, cola pendiente, rollback de transicion y replica. |
| Reset confirmation | `apps/web/src/application/storage/StorageManager.test.ts` y `apps/api/tests/test_sync_api.py` | PASS: reset local separado y reset Cloud exige `RESET TASKFLOW DATA`. |
| Import invalido/corrupto | `apps/web/src/application/storage/Snapshot.test.ts` y `apps/web/src/infrastructure/indexeddb/repositories.test.ts` | PASS: checksum, counts, referencias y registros corruptos se rechazan. |
| Worker lost/retry | `apps/api/apps/voice/tasks.py`, `apps/api/config/settings/base.py`, `apps/api/tests/test_ai_quota.py`, `apps/api/tests/test_voice_infrastructure.py` | PASS por contrato: `acks_late`, `reject_on_worker_lost`, retry acotado y cleanup verificados. El kill de un worker real queda como smoke operativo de deployment. |
| Database unavailable | `apps/api/tests/test_health.py` y `apps/api/tests/test_voice_infrastructure.py` | PASS: readiness devuelve 503 sin detalles internos y fallo de cola no deja audio expuesto. |
| PostgreSQL backup/restore | Drill Compose ejecutado sobre `taskflow_phase14_restore`; `pg_dump` por pipe, restore correcto, `django_migrations = 33`, base temporal eliminada. | PASS sin tocar `taskflow` ni eliminar volumen. |

## Validacion final

- API: `127 passed in 2.08s`.
- Web: `21 archivos, 60 pruebas pasadas`.
- Web typecheck: correcto.
- Web lint: correcto.
- Restore drill PostgreSQL: correcto, salida de migraciones restauradas `33`.
