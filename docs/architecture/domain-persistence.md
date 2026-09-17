# Persistencia del dominio TaskFlow

## Ownership

Los registros privados no tienen una FK a usuarios locales. `external_user_id`
es el `Accounts.User.id` normalizado por `AccountsSessionAdapter`; toda consulta
de dominio debe incluirlo en el selector. Un UUID conocido de otro usuario se
trata como recurso inexistente mediante `ResourceNotFound`.

## Modelos de Phase 3

- `List`: listas del usuario e Inbox de sistema. Existe como máximo un Inbox por usuario mediante una unicidad parcial.
- `Task`: tarea pendiente o completada, con `completed_at` coherente y `deleted_at` para borrado lógico.
- `TaskEvent`: historial append-only. Conserva `task_id` como UUID sin FK para que el historial sobreviva al borrado lógico o a futuras purgas.
- `SyncOperation`: sobre de operación con `device_id`, versión, cursor futuro e idempotency key única por usuario.
- `VoiceSession`: estado, transcript de la ventana de polling/revision y metadatos no sensibles del pipeline. No contiene audio ni una ruta de audio permanente; la politica completa esta en `docs/architecture/voice-retention.md`.

Todos usan UUID global, timestamps timezone-aware y el mixin abstracto
`OwnedTimestampedModel`.

## Transacciones

Los servicios de listas y tareas agrupan mutación y evento en una única
transacción. `complete_task` y `reopen_task` son idempotentes: repetir el estado
final no añade otro evento. `delete_task` conserva la fila y registra un único
evento. Eliminar una lista mueve sus tareas a Inbox antes de borrar la lista;
Inbox no se puede renombrar, archivar ni eliminar.

## Migraciones y rollback

Las migraciones se generan desde Django y deben revisarse junto al modelo:

```bash
cd apps/api
python manage.py makemigrations
python manage.py migrate
python manage.py check
```

La prueba `tests/test_migrations.py` aplica los leaf migrations de los cinco
módulos, verifica las tablas, revierte a cero y vuelve a aplicar el estado
actual. El rollback de producción debe ejecutarse solo tras comprobar que la
migración anterior es compatible con los datos; no se borran tablas manualmente.
