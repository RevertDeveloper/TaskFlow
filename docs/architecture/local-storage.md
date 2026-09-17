# Persistencia local de TaskFlow

## Limite de la capa

La persistencia de Device Mode vive en IndexedDB mediante Dexie. Los
componentes React no importan Dexie ni acceden a `indexedDB`; consumen puertos
de repositorio. `LocalRepository` es la fachada que coordina las mutaciones y
los repositorios `IndexedDb*` realizan lecturas y conversiones entre records y
modelos de dominio.

La base se llama `taskflow-local`. Cada instalacion genera un `device_id`
UUID-v4 persistente en `app_state`. No se usa `localStorage` para tareas,
eventos, sesiones de voz u operaciones de sincronizacion.

## Schema versionado

La version actual es `2` y contiene estos stores:

| Store | Clave | Uso |
|---|---|---|
| `lists` | `id` UUID | Listas y la Inbox permanente |
| `tasks` | `id` UUID | Tareas, incluyendo tombstones locales |
| `task_events` | `id` UUID | Historial append-only |
| `sync_operations` | `id` UUID, `idempotencyKey` unico | Cola local pendiente |
| `app_state` | `key` | `device_id`, `schema_version`, contador de cliente |
| `voice_sessions` | `id` UUID | Metadatos de voz, nunca audio permanente |

La version `1` conserva los stores basicos. La migracion a `2` anade los
stores nuevos y completa defaults ausentes en records legacy sin borrar
campos ni registros. Una apertura nueva crea la Inbox sistemica si no existe;
esta inicializacion no genera eventos ni operaciones de sincronizacion.

## Escrituras atomicas

Una mutacion local coordinada por `LocalRepository` ejecuta en la misma
transaccion Dexie:

1. Actualizacion o creacion de la entidad.
2. Creacion de su `TaskEvent`.
3. Creacion de un `SyncOperation` con `idempotencyKey` UUID.
4. Incremento del `client_version`.

La transaccion incluye `lists`, `tasks`, `task_events`, `sync_operations` y
`app_state`. Si se aborta antes del commit, no queda ningun registro parcial.
Una repeticion conserva la clave de idempotencia; si la operacion ya existe,
se devuelve la entidad persistida y no se crean duplicados. Una clave
reutilizada con otra entidad, operacion o payload se rechaza.

Los abortos transitorios se reintentan como maximo dos veces por defecto y
nunca se usa `sleep` para sincronizar. Un `QuotaExceededError` falla cerrado y
no se reintenta, porque repetirlo no libera espacio.

## Corrupcion y errores

Los records se validan al leerlos. Un UUID, estado, tipo de evento o payload
invalido produce `LocalStorageValidationError`; el dato no se entrega a la
UI ni se repara silenciosamente. La cuota se expone como
`LocalStorageQuotaError` sin detalles internos. Los abortos agotados se
exponen como `LocalStorageTransactionError`.

## Rollback y recuperacion

Las migraciones son forward-only. No se intenta hacer downgrade de una base
abierta: una version nueva debe migrar desde la anterior y conservar los datos.
Si una migracion falla, la transaccion de upgrade de IndexedDB se revierte y
la version anterior queda disponible para reintentar tras corregir la causa.
No se eliminan stores ni registros durante una migracion.

Si una pestaña se cierra durante un commit, IndexedDB revierte la transaccion
si el commit no habia terminado; si el commit ya termino pero la respuesta se
perdio, la clave de idempotencia permite recuperar la entidad sin duplicar
evento ni operacion. Un payload corrupto detiene la lectura para evitar
propagar datos no validados. La exportacion/restauracion operativa completa
pertenece a las fases de hardening y despliegue.

La politica de autoridad, replica Cloud y seleccion Device esta documentada
en [storage-modes.md](storage-modes.md). `LocalRepository` es la implementacion
local compartida por ambos modos; Cloud puede usarla como fallback y cola,
mientras que Device la usa como fuente principal.

## Evidencia local

La suite de Phase 7 cubre apertura y metadatos, migracion v1 -> v2, stores
ausentes, CRUD local, paginacion de historial, operaciones pendientes,
payload corrupto, abortos, reintentos, idempotencia y cuota. Se ejecuta con:

```bash
npm test -- src/infrastructure/indexeddb/database.test.ts src/infrastructure/indexeddb/repositories.test.ts src/infrastructure/repositories/LocalRepository.test.ts
npm run typecheck
```