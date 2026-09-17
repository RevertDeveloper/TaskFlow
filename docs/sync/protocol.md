# Protocolo de sincronización

## Versión y límites

El protocolo actual es la versión `1`. El cliente envía como máximo 100
operaciones por lote y el servidor devuelve como máximo 100 cambios por
respuesta. Una operación tiene un UUID global (`operation_id`), una clave de
idempotencia por usuario, el UUID del dispositivo, el tipo y UUID de entidad,
la mutación, una versión de cliente, una fecha del cliente solo diagnóstica y
un payload versionado.

Los índices de IndexedDB nunca son identificadores de entidad. Las listas y
tareas usan UUID desde su creación.

## Push

`POST /api/v1/sync/push/` requiere la sesión de Accounts y el CSRF propio de
TaskFlow. El cuerpo sigue `packages/schemas/sync-push.schema.json`:

```json
{
  "version": 1,
  "operations": [
    {
      "operation_id": "uuid",
      "device_id": "uuid",
      "entity_type": "task",
      "entity_id": "uuid",
      "mutation": "update",
      "client_version": 4,
      "client_timestamp": "2026-09-17T10:00:00Z",
      "payload_version": 1,
      "payload": {"entityId": "uuid", "status": "completed"},
      "idempotency_key": "uuid"
    }
  ]
}
```

`idempotency_key` es opcional para compatibilidad con operaciones antiguas; si
falta, el API usa `operation_id`. La misma clave nunca produce dos mutaciones.
El servidor valida ownership con la identidad de Accounts y nunca acepta un
`external_user_id` enviado por el navegador.

La respuesta contiene `accepted`, `rejected`, `conflicts` y `changes`. Un
reintento de una operación aceptada devuelve `accepted` de nuevo sin repetir
la mutación. Los rechazos permanentes se marcan como procesados para no crear
un bucle de reintentos; un conflicto devuelve su `code` y `message`, y el
cliente obtiene el estado remoto mediante el pull siguiente.

## Pull y cursor

`GET /api/v1/sync/pull/?cursor=<cursor>&limit=<n>` requiere sesión de Accounts.
El cursor es opaco y se debe almacenar sin interpretarlo. Representa el último
par `(updated_at, entity_type, entity_id)` aplicado. El orden estable es
`updated_at`, después `list` antes de `task` y finalmente el UUID. Un cursor
repetido devuelve una página determinista; cuando `has_more` es falso, el
cursor recibido se conserva si no hay cambios.

La respuesta sigue `packages/schemas/sync-pull.schema.json`. Los cambios de
borrado conservan un tombstone con `operation: delete`, `updated_at` y los
datos mínimos de la entidad. El cliente debe aplicar el cambio antes de
avanzar el cursor.

## Semántica de conflictos

El servidor asigna `updated_at` al aceptar una mutación. Ese timestamp es la
autoridad para Last Write Wins; `client_timestamp` no puede adelantar ni
retrasar artificialmente una operación. Cuando hay empate, el cliente compara
la versión de cliente y el UUID de operación de forma determinista. Los
tombstones participan en la misma comparación, por lo que una réplica antigua
no puede resucitar una entidad borrada.

Las operaciones de `complete` y `edit` modifican la misma versión de tarea. La
versión más nueva gana y el conflicto queda contabilizado, sin combinar campos
de estados diferentes.

## Fallos y privacidad

El cliente pausa si el navegador está offline. Ante timeout, `408`, `429` o
`5xx` reintenta un máximo de tres veces con backoff exponencial y jitter; no
reintenta errores de validación o autenticación. La operación sigue pendiente
si el transporte no confirma el lote.

Los logs solo incluyen `request_id`, `sync_id`, `operation_id`, estado,
conteos, reintentos y conflictos. No incluyen títulos, descripciones, cookies,
payloads ni datos de Accounts.