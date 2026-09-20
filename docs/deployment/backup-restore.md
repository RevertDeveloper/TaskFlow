# Backup y restore

TaskFlow usa PostgreSQL como autoridad cloud. IndexedDB es una réplica/local y
no sustituye el backup del servidor.

## Política

- Backup lógico comprimido diario.
- Retención mínima: 7 días.
- Permisos del directorio: `0700`; archivos: `0600`.
- El backup se cifra en el almacenamiento externo o secret manager de
  infraestructura; no se versiona.
- RPO máximo: 24 horas. RTO objetivo: 4 horas.

## Ejecutar

```bash
export TASKFLOW_ENV_FILE=/ruta/segura/.env.production
export TASKFLOW_BACKUP_ROOT=/srv/private/taskflow-backups
./infra/scripts/backup.sh
```

Programar el script con un timer/cron del host y enviar sólo el resultado
operativo a la monitorización. Nunca registrar el contenido del dump.

## Drill

1. Crear un backup.
2. Levantar un proyecto Compose de staging con volúmenes separados.
3. Ejecutar `restore.sh <backup> --confirm` allí.
4. Ejecutar `migrate.sh` y validar `/api/ready`, login, aislamiento y CRUD.
5. Registrar timestamp, versión, duración y resultado, sin datos de usuario.

Un backup sólo se considera válido después de ser restaurado y verificado.
