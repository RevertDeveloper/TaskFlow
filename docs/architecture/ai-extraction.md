# Extraccion AI y cuota

## Contratos

La salida del LLM es texto no confiable. `TaskExtractionProvider` solo devuelve
la respuesta del proveedor; `extract_tasks()` la limita, parsea con JSON estricto,
valida contra `task_extraction.schema.json` y comprueba que cada `list_id` exista
entre las listas autorizadas. Ningun draft se persiste en esta fase.

Los prompts se leen desde `apps/api/apps/ai/prompts/`. El transcript se entrega
en una seccion separada como dato no confiable. No se interpolan claves ni
credenciales en prompts, snapshots, metadatos de cuota o logs.

## Ciclo de cuota

Cada operacion AI usa una accion independiente:

- `voice_transcription` usa el UUID de `VoiceSession` como `request_id`.
- `voice_task_extraction` recibe un UUID de operacion generado por el caso de uso
  o entregado por su caller.

El flujo es `reserve` con la sesion del usuario, `validate` una sola vez con
`X-Application-Slug` y `X-Service-Key`, trabajo del proveedor y `complete` o
`fail`. El cliente de Accounts es exclusivamente server-side. La service key no
se envia al navegador ni al endpoint publico de reserva.

Los reintentos Celery de STT conservan un marcador interno en `VoiceSession`
para no validar dos veces la misma reserva. Un fallo antes de usar el proveedor
usa `before_processing`, el codigo reembolsable por la politica actual de
Accounts. Las respuestas de Accounts ausentes, malformadas, rechazadas o con
clave invalida detienen la operacion sin invocar el proveedor.

## Configuracion

En desarrollo automatizado se puede usar `ACCOUNTS_QUOTA_MODE=fake`. En
produccion debe usarse `accounts` y definirse `ACCOUNTS_TASKFLOW_SERVICE_KEY`
fuera del repositorio. `AI_LLM_MAX_RETRIES` esta limitado por el servicio a un
maximo de un intento de reparacion y `AI_MAX_LLM_RESPONSE_CHARS` limita el
tamano de la respuesta sin confiar en el proveedor.