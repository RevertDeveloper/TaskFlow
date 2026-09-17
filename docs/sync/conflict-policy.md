# Política de conflictos de sincronización

## Autoridad

TaskFlow usa Last Write Wins por entidad. El servidor asigna `updated_at` al
aceptar cada mutación y ese valor es la autoridad de orden. La fecha enviada
por el cliente se conserva solo para diagnóstico y no puede forzar una versión
antigua por encima de una nueva.

Cuando dos cambios tienen el mismo `updated_at`, el desempate estable es:

1. mayor `client_version`;
2. mayor UUID de operación, comparado como texto hexadecimal.

El servidor procesa cada operación dentro de una transacción y devuelve el
estado normalizado de la entidad. El cliente aplica el cambio remoto solo si
su `updated_at` gana la comparación local; si gana la réplica local, la
operación local permanece pendiente para volver a intentarse.

## Casos de dominio

- **Dos dispositivos crean:** ambos UUID se conservan y el pull devuelve las
  dos entidades.
- **Dos dispositivos editan:** la entidad queda con el cambio de la versión
  ganadora; el cliente registra un conflicto operativo sin mezclar campos.
- **Completar frente a editar:** ambos son versiones de la tarea. Gana la
  versión más nueva y se mantiene el par coherente `status/completed_at`.
- **Borrar frente a actualizar:** `deleted_at` es un tombstone y participa en
  el mismo orden. Una operación antigua no resucita la entidad.
- **Inbox:** es una lista de sistema protegida; nunca se puede borrar,
  archivar o renombrar por sync.

## Idempotencia y recuperación

La clave de idempotencia es única por `external_user_id`. El servidor persiste
el resultado `accepted`, `rejected` o `conflict`; un retry devuelve el mismo
resultado sin repetir eventos de dominio. Un timeout deja la operación local
pendiente porque no existe confirmación segura.

Los errores transitorios (`408`, `429`, `5xx` y fallo de red) usan hasta tres
intentos con backoff y jitter. Los errores de validación, ownership o
tombstone se resuelven con el cambio remoto o se marcan como rechazados para
evitar reintentos infinitos.

## Cursor

El pull ordena por `(updated_at, entity_type, entity_id)` y devuelve un cursor
opaco para la última entrada aplicada. El cursor solo avanza después de
persistir todos los cambios de la página. Si una página se repite, el resultado
es determinista; si no hay cambios, se conserva el cursor anterior.