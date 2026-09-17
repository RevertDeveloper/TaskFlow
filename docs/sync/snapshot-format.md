# Formato de snapshot

## Propósito

El snapshot es el contrato versionado para trasladar el estado visible de un
usuario entre la autoridad remota de Cloud y la autoridad local de Device. No
contiene cookies, credenciales, audio, prompts ni respuestas de proveedores.

La versión actual es `1` y está definida en
`packages/schemas/snapshot.schema.json`.

## Integridad

`checksum` es el SHA-256 en hexadecimal minúsculo de la serialización JSON
canónica del snapshot sin el campo `checksum`. La serialización ordena las
claves de objetos y ordena `lists`, `tasks` y `events` por `id`, por lo que el
resultado no depende del orden de una consulta.

`counts` debe coincidir exactamente con las colecciones y con
`sync.pending_operations`. El receptor valida el schema, las relaciones de
listas y tareas, los UUID y el checksum antes de escribir IndexedDB.

## Datos de sincronización

`sync` conserva el `device_id`, el cursor remoto, la versión de cliente y el
número de operaciones pendientes. Las operaciones no se incluyen en el
snapshot: sus payloads pueden contener datos de usuario y se transportan por el
protocolo de sync autenticado, con idempotencia y ownership.

## Cambio de modo

- Cloud -> Device: se obtiene el snapshot remoto, se valida y se reemplaza el
  contenido local en una transacción IndexedDB. Device solo se activa después
  del commit y de una segunda verificación de conteos.
- Device -> Cloud: se valida el snapshot local, se drenan las operaciones
  pendientes mediante sync, se obtiene el estado remoto final y solo entonces
  se activa Cloud.
- Cualquier error deja intactos el modo activo y los datos locales anteriores.

La baja de cuenta pertenece a `carlosrevert-accounts`; ningún reset de datos
locales o de datos TaskFlow ejecuta esa operación.