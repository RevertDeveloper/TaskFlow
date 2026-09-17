# Modos de almacenamiento

## Contrato

`StorageManager` es la unica superficie que recibe la aplicacion para listas,
tareas, historial y operaciones pendientes. Las features no importan el
cliente HTTP, Dexie ni `IndexedDB`.

Su estado distingue autoridad, fuente de la respuesta y disponibilidad:

| Campo | Significado |
|---|---|
| `mode` | Modo seleccionado: `cloud` o `device`. |
| `authority` | `remote` en Cloud; `local` en Device. |
| `source` | Origen de los datos mostrados: remoto, local o desconocido. |
| `isStale` | La UI muestra una replica local que puede no contener lo ultimo del servidor. |
| `pendingOperations` | Operaciones locales aun no procesadas. |
| `syncStatus` | Estado de la cola; en Device es `disabled`. El motor completo llega en Phase 9. |
| `availability` | `loading`, `available` o `unavailable`. |
| `replicaAvailable` | Indica si IndexedDB puede guardar la replica operativa. |
| `lastRemoteSuccessAt` | Ultima respuesta remota aceptada. |
| `lastSyncedAt` | Reservado para la sincronizacion completa de Phase 9; permanece nulo en Phase 8. |

## Cloud Mode

PostgreSQL/API remoto es la autoridad. Una lectura remota se devuelve despues
del mapeo DTO y se escribe en IndexedDB como replica operativa, sin crear un
evento ni una operacion de sync. Una mutacion remota correcta sigue la misma
politica de cache.

Si la red no esta disponible o el API responde con timeout o error 5xx, las
lecturas usan la replica local y se marcan `source=local` e `isStale=true`.
Una mutacion en ese estado se ejecuta mediante `LocalRepository`, que deja la
entidad, el evento y la operacion pendiente en una transaccion atomica.

Los errores de validacion, autenticacion o autorizacion no hacen fallback
local. Se propagan a la feature para que la UI pueda informar del fallo real.

Phase 8 prepara la cola, pero no inventa endpoints, cursores, reintentos de
red ni resolucion de conflictos. El drenaje idempotente y la reconciliacion
pertenecen a Phase 9.

## Device Mode

IndexedDB es la fuente y autoridad local. El modo no necesita red y comparte
los mismos puertos de listas, tareas, historial y sync que Cloud. Sus
operaciones pendientes se conservan localmente para una posible evolucion de
modo, pero `syncStatus=disabled` deja claro que no se enviaran remotamente en
esta fase.

## Configuracion y UI

`STORAGE_MODE=cloud|device` se expone como configuracion publica no sensible
del bundle web. El constructor de `StorageManager` acepta el modo de forma
explicita para pruebas y composicion de la aplicacion.

La sidebar muestra el modo, la fuente efectiva, si los datos son stale y el
numero de operaciones pendientes. No afirma que exista sincronizacion
completa antes de Phase 9.