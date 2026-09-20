# Observabilidad

## Logs

El API escribe JSON a stdout. Los eventos incluyen `request_id` y, cuando
aplica, `sync_id`, `operation_id`, `voice_session_id`, proveedor, latencia y
código de error. No se registran cookies, cuerpos HTTP, prompts, transcripciones,
audio ni claves. Los identificadores de usuario deben ser opacos si se añaden a
un evento futuro.

## Métricas

`GET /api/metrics` requiere `X-Metrics-Token`. Las métricas actuales son:

- `taskflow_http_requests_total` y `taskflow_http_request_duration_seconds`;
- `taskflow_accounts_validations_total`;
- `taskflow_sync_operations_total`;
- `taskflow_voice_transcriptions_total` y
  `taskflow_voice_provider_duration_seconds`.

Las rutas HTTP se toman del patrón Django o se normalizan; no se usan UUIDs como
labels. Prometheus debe consultar este endpoint sólo por red interna o mediante
un proxy autenticado.

Las reglas iniciales están versionadas en `infra/monitoring/alerts.yml`. Las
alertas de disponibilidad requieren un scrape job `taskflow-api`; las alertas
de base de datos, Redis, Celery queue lag y backup requieren sus
exporters/monitores de infraestructura correspondientes.

## Alertas mínimas

- `/api/ready` devuelve 503 durante más de 2 minutos;
- aumento sostenido de respuestas 5xx;
- Accounts no disponible;
- conflictos de sync o cola de voz por encima del umbral acordado;
- errores de proveedor o callbacks de cuota;
- saturación de PostgreSQL/Redis y fallo de backup diario.

Cada alerta debe incluir servicio, entorno, release y `request_id` cuando exista.
