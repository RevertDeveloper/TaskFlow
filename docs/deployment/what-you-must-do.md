# Qué falta hacer para publicar TaskFlow

Este documento describe las tareas manuales que debe realizar la persona
responsable de infraestructura para pasar de la implementación actual a una
publicación real y verificable.

## Estado actual

El código, las imágenes Docker, Compose, los scripts operativos, las pruebas y
el workflow de release ya están preparados. La publicación todavía no puede
darse por terminada porque faltan recursos externos y evidencias reales:

- crear la aplicación `taskflow` dentro de Accounts;
- generar y custodiar la clave interna de Accounts;
- crear los secretos de staging y producción;
- configurar DNS y el proxy HTTPS;
- disponer de un runner/host de staging y otro de producción;
- ejecutar el smoke HTTPS con una cuenta de prueba;
- probar backup/restore, rollback, alertas y accesibilidad.

No se debe marcar Phase 16 como completada ni anunciar TaskFlow como disponible
hasta que todas las comprobaciones de este documento estén hechas.

## 1. Accesos que necesitas

Antes de empezar, reúne estos accesos:

| Acceso | Para qué sirve |
| --- | --- |
| Django Admin de Accounts | Crear `ClientApplication` y rotar su clave |
| Host o runner de staging | Ejecutar Compose y el smoke real |
| Host o runner de producción | Ejecutar el despliegue público |
| DNS del dominio | Crear `taskflow.carlosrevert.es` y, si procede, staging |
| Nginx Proxy Manager o proxy equivalente | Terminar TLS y reenviar al frontend |
| GitHub con permisos de Actions/Packages | Publicar imágenes y aprobar environments |
| Cuenta demo de Accounts | Probar login, logout, expiración, CSRF y cookies |
| Almacenamiento privado de backups | Guardar dumps cifrados con retención mínima de 7 días |
| Prometheus/Alertmanager | Scraping, dashboards y alertas |

La cuenta demo debe ser una cuenta específica de QA. No uses una cuenta personal
ni pongas usuario, contraseña, cookies o claves en issues, logs, capturas o
commits.

## 2. Crear la aplicación en Accounts

TaskFlow consume la cuota de Accounts y se autentica con una credencial interna.
La credencial no se crea en TaskFlow ni se puede recuperar posteriormente: sólo
se muestra una vez al rotarla.

### 2.1 Crear o revisar `ClientApplication`

En el Django Admin de `carlosrevert-accounts`:

1. Abre **Applications / Client applications**.
2. Crea o localiza la aplicación con estos valores:

| Campo | Valor |
| --- | --- |
| Name | `TaskFlow` |
| Slug | `taskflow` |
| Base URL | `https://taskflow.carlosrevert.es` |
| Active | Activado |
| Consumes quota | Activado |

3. Guarda la aplicación.
4. Comprueba que el slug no tenga mayúsculas, espacios ni una variante como
   `task-flow`.

### 2.2 Rotar la clave interna

1. Selecciona la aplicación `taskflow`.
2. Ejecuta la acción **Rotar credencial de servicio**.
3. Copia la clave directamente al gestor de secretos o al archivo seguro del
   servidor. La clave no debe pasar por un chat, editor, ticket o terminal con
   historial persistente.
4. No cierres la pantalla hasta confirmar que la clave se ha guardado de forma
   segura.
5. Si la clave se pierde o se expone, vuelve a ejecutar la rotación. La clave
   anterior dejará de funcionar.

Accounts guarda solamente un hash mediante `ClientApplication.rotate_service_key()`;
no existe una pantalla para recuperar la clave original.

### 2.3 Verificaciones en Accounts

Antes de continuar, confirma:

- `taskflow` está activo.
- `taskflow.consumes_quota` está activo.
- La URL base es exactamente `https://taskflow.carlosrevert.es`.
- La aplicación tiene una clave rotada.
- El plan de la cuenta demo permite al menos una interacción.
- `https://cuenta.carlosrevert.es/health/` responde correctamente.
- Accounts acepta `https://taskflow.carlosrevert.es` como origen CSRF confiable.
- La cookie de sesión está configurada para compartirse entre los subdominios
  autorizados, según la configuración ya existente de Accounts.

No cambies el modelo de autenticación a JWT/OAuth: TaskFlow usa la sesión Django
compartida y el proxy same-origin ya implementado.

## 3. Generar los secretos

Genera valores distintos para staging y producción. Nunca reutilices la clave
Django, la contraseña PostgreSQL, el token de métricas o la clave de Accounts
entre entornos.

Desde un host seguro puedes generar valores con:

```bash
python3 - <<'PY'
import secrets

for name in (
    "DJANGO_SECRET_KEY",
    "POSTGRES_PASSWORD",
    "TASKFLOW_METRICS_TOKEN",
):
    print(f"{name}={secrets.token_urlsafe(48)}")
PY
```

La salida debe ir directamente al gestor de secretos. No la guardes en un
archivo dentro del repositorio ni la pegues en esta documentación.

Secretos obligatorios:

- `DJANGO_SECRET_KEY`: mínimo 50 caracteres en producción.
- `POSTGRES_PASSWORD`: contraseña exclusiva de la base TaskFlow.
- `ACCOUNTS_TASKFLOW_SERVICE_KEY`: la clave única rotada en Accounts.
- `TASKFLOW_METRICS_TOKEN`: token exclusivo para Prometheus.

También necesitarás estos valores no secretos:

```text
TASKFLOW_PUBLIC_URL=https://taskflow.carlosrevert.es
ACCOUNTS_BASE_URL=https://cuenta.carlosrevert.es
ACCOUNTS_APPLICATION_SLUG=taskflow
ACCOUNTS_QUOTA_MODE=accounts
AI_PROVIDER=fake
DJANGO_ALLOWED_HOSTS=taskflow.carlosrevert.es
POSTGRES_DB=taskflow
POSTGRES_USER=taskflow
DATABASE_URL=postgresql://taskflow:<PASSWORD>@db:5432/taskflow
```

En producción `AI_PROVIDER=fake` permite validar el flujo sin coste de proveedor.
Para activar STT/LLM real, cambia el proveedor sólo después de validar límites,
retención, coste y las claves correspondientes. Las claves `OPENAI_API_KEY` o
`GEMINI_API_KEY` sólo deben existir en el entorno que realmente las utilice.

## 4. Crear el archivo de entorno del servidor

En cada host crea un archivo fuera del repositorio, por ejemplo:

```bash
sudo install -d -m 700 /etc/taskflow
sudo install -m 600 /dev/null /etc/taskflow/.env.production
sudoedit /etc/taskflow/.env.production
```

El archivo debe incluir como mínimo:

```dotenv
TASKFLOW_RELEASE=v0.1.0
TASKFLOW_IMAGE_REGISTRY=ghcr.io/ORGANIZACION/taskflow
TASKFLOW_PUBLIC_URL=https://taskflow.carlosrevert.es
WEB_PORT=10700
API_PORT=10701

DJANGO_SECRET_KEY=<generado-para-este-entorno>
DJANGO_ALLOWED_HOSTS=taskflow.carlosrevert.es
POSTGRES_DB=taskflow
POSTGRES_USER=taskflow
POSTGRES_PASSWORD=<generado-para-este-entorno>
DATABASE_URL=postgresql://taskflow:<PASSWORD>@db:5432/taskflow

ACCOUNTS_BASE_URL=https://cuenta.carlosrevert.es
ACCOUNTS_APPLICATION_SLUG=taskflow
ACCOUNTS_QUOTA_MODE=accounts
ACCOUNTS_TASKFLOW_SERVICE_KEY=<clave-rotada-en-Accounts>
TASKFLOW_METRICS_TOKEN=<token-generado-para-este-entorno>

AI_PROVIDER=fake
AI_STT_PROVIDER=
AI_LLM_PROVIDER=
LOG_LEVEL=INFO
```

Sustituye todos los valores entre `<...>`. No uses literalmente el ejemplo.

Comprueba permisos y que Git no lo esté siguiendo:

```bash
chmod 600 /etc/taskflow/.env.production
git check-ignore /etc/taskflow/.env.production || true
```

El archivo no debe estar dentro de `/home/.../TaskFlow`, no debe subirse a
GitHub y no debe entrar en una imagen Docker.

## 5. Configurar DNS y HTTPS

### 5.1 DNS

Crea un registro DNS para:

```text
taskflow.carlosrevert.es -> IP pública del host/proxy
```

Si usas staging, utiliza un hostname separado, por ejemplo
`taskflow-staging.carlosrevert.es`, y una configuración de Accounts que permita
ese origen. Staging no debe compartir cookies, base de datos, Redis ni secretos
con producción.

Comprueba la propagación:

```bash
dig +short taskflow.carlosrevert.es
curl -I https://taskflow.carlosrevert.es/
```

### 5.2 Nginx Proxy Manager

Crea un Proxy Host para `taskflow.carlosrevert.es` con:

| Configuración | Valor |
| --- | --- |
| Forward hostname/IP | `127.0.0.1` |
| Forward port | `10700` |
| Scheme | `http` interno |
| WebSocket support | Activado si el proxy lo ofrece |
| SSL certificate | Certificado Let's Encrypt válido |
| Force SSL | Activado |
| HSTS | Activado después de verificar HTTPS |

No apuntes el proxy a `10701`, PostgreSQL o Redis. Sólo el frontend en `10700`
debe ser público.

El proxy debe reenviar al menos:

```text
Host
X-Forwarded-For
X-Forwarded-Proto
X-Request-ID (si existe)
```

`X-Forwarded-Proto` debe valer `https` para peticiones públicas HTTPS. Django lo
usa para evitar redirecciones incorrectas y proteger cookies/CSRF.

## 6. Preparar GitHub Actions y el registry

El workflow de release está en `.github/workflows/release.yml`.

1. Activa GitHub Packages/Container Registry para el repositorio.
2. Verifica que Actions tenga permiso `packages: write`.
3. Crea dos GitHub Environments: `staging` y `production`.
4. Añade aprobación manual al environment `production`.
5. Usa runners self-hosted etiquetados como:
   - `taskflow-staging`;
   - `taskflow-production`.
6. Configura en cada environment la variable `TASKFLOW_ENV_FILE` con la ruta
   local del archivo seguro del runner, por ejemplo
   `/etc/taskflow/.env.staging` o `/etc/taskflow/.env.production`.
7. El archivo `.env` no debe viajar por GitHub Actions: sólo se referencia por
   ruta local del runner.

El runner debe tener Docker, Docker Compose, acceso al registry y acceso de red
al dominio público. El runner de producción debe ser el único autorizado para
operar el proyecto Compose de producción.

## 7. Desplegar staging

Primero publica un tag desde una rama aprobada:

```bash
git tag v0.1.0
git push origin v0.1.0
```

También puedes iniciar el workflow manualmente desde GitHub Actions. Selecciona
el release y activa staging, pero no producción.

En el runner, la secuencia equivalente es:

```bash
export TASKFLOW_ENV_FILE=/etc/taskflow/.env.staging
export TASKFLOW_PROJECT_NAME=taskflow-staging
./infra/scripts/deploy.sh staging
```

El script:

1. espera PostgreSQL y Redis saludables;
2. ejecuta `check --deploy`;
3. aplica migraciones explícitas;
4. ejecuta `collectstatic`;
5. actualiza web, API y worker;
6. ejecuta el smoke HTTP configurado.

Si falla, no ejecutes `docker compose down -v`. Conserva los volúmenes y revisa
el release y los logs del servicio afectado.

## 8. Ejecutar el smoke real de Accounts

Hazlo en una ventana privada o perfil Chromium limpio y con la cuenta demo.
Nunca registres contraseña, cookie ni cuerpos completos de petición.

Checklist mínimo:

- abrir TaskFlow como usuario anónimo;
- abrir login y autenticarse mediante Accounts;
- recargar y confirmar que la sesión persiste;
- confirmar que `/api/v1/auth/me/` devuelve la identidad correcta a través del
  proxy same-origin;
- crear, editar, completar y reabrir una tarea;
- cerrar sesión y confirmar que la vista privada queda bloqueada;
- invalidar o caducar la sesión en Accounts y confirmar el estado anónimo;
- comprobar una mutación con CSRF válido;
- comprobar que una mutación sin CSRF recibe rechazo;
- iniciar sesión en Accounts en otra pestaña y comprobar sesión compartida;
- cerrar sesión global y confirmar que TaskFlow queda anónimo;
- probar una operación AI y confirmar reserva, validación y finalización de
  cuota sin duplicar consumo;
- verificar que una cuenta bloqueada no puede consumir cuota.

Registra sólo fecha, entorno, resultado y `X-Request-ID` de errores. Guarda las
capturas en un artefacto privado de QA.

## 9. Configurar backups

Define un almacenamiento privado fuera del checkout, por ejemplo:

```bash
sudo install -d -m 700 /srv/private/taskflow-backups
export TASKFLOW_ENV_FILE=/etc/taskflow/.env.production
export TASKFLOW_BACKUP_ROOT=/srv/private/taskflow-backups
./infra/scripts/backup.sh
```

Programa `backup.sh` diariamente con systemd timer o cron. El script:

- genera un dump PostgreSQL comprimido;
- valida gzip;
- crea `SHA256SUMS` portable;
- usa permisos restrictivos;
- elimina backups con más de 7 días según la retención configurada.

Configura cifrado del almacenamiento externo y una alerta si el backup diario no
aparece. El script no sustituye el cifrado del almacenamiento.

## 10. Hacer el restore drill

Antes de producción, restaura un backup en un proyecto Compose de staging aislado:

```bash
export TASKFLOW_ENV_FILE=/etc/taskflow/.env.staging
export TASKFLOW_PROJECT_NAME=taskflow-restore-drill
./infra/scripts/restore.sh /srv/private/taskflow-backups/<TIMESTAMP> --confirm
./infra/scripts/migrate.sh
./infra/scripts/smoke.sh
```

Mide y registra:

- timestamp del backup utilizado;
- duración del restore;
- duración total hasta servicio saludable;
- resultado de login, CRUD, readiness y aislamiento;
- datos perdidos, que deben estar dentro del RPO de 24 horas;
- tiempo total, que debe estar dentro del RTO de 4 horas.

No ejecutes `restore.sh` sobre producción como primera prueba.

## 11. Configurar alertas

Carga `infra/monitoring/alerts.yml` en Prometheus/Alertmanager y crea un scrape
job interno para `/api/metrics`:

```yaml
scrape_configs:
  - job_name: taskflow-api
    metrics_path: /api/metrics
    static_configs:
      - targets: ["127.0.0.1:10701"]
    headers:
      X-Metrics-Token: ["<token-del-entorno>"]
```

El formato exacto de `headers` depende de la versión de Prometheus o del proxy;
si no lo admite, usa un proxy interno que añada `X-Metrics-Token`. Nunca hagas
público `/api/metrics`.

Activa notificaciones para:

- readiness caída durante más de 2 minutos;
- respuestas 5xx;
- Accounts no disponible;
- conflictos de sync;
- fallos de STT/LLM;
- cola Celery atrasada;
- PostgreSQL/Redis saturados;
- backup diario ausente.

Dispara una alerta controlada y confirma que llega al canal de guardia.

## 12. Ejecutar rollback drill

En staging:

1. Despliega release `v0.1.0`.
2. Despliega un release posterior.
3. Simula un fallo de readiness o una regresión de login.
4. Cambia `TASKFLOW_RELEASE` al tag anterior.
5. Ejecuta `deploy.sh staging`.
6. Confirma `/api/ready`, login, logout y CRUD.
7. Si el schema no es compatible, prueba `restore.sh` con un backup aislado.

Documenta duración y resultado. No reviertas migraciones destructivamente sin un
backup probado y aprobación explícita.

## 13. Revisión de accesibilidad

Con teclado y lector de pantalla:

- entrar y salir de la aplicación;
- navegar sidebar y navegación móvil;
- cambiar de lista;
- crear y editar tareas;
- abrir/cerrar diálogos;
- comprobar foco visible y retorno del foco;
- verificar nombres accesibles de botones icon-only;
- repetir en móvil y con `prefers-reduced-motion`.

Cualquier acción bloqueada para teclado o sin nombre accesible impide cerrar el
gate de producción.

## 14. Promover producción

Sólo después de que staging pase todas las comprobaciones:

1. Confirma que el backup diario está disponible.
2. Confirma que el release está publicado en GHCR.
3. Aprueba el environment `production` en GitHub Actions.
4. Ejecuta el job de producción con
   `TASKFLOW_ENV_FILE=/etc/taskflow/.env.production`.
5. Comprueba `https://taskflow.carlosrevert.es/` y `/api/ready`.
6. Ejecuta login, logout y una operación manual no destructiva.
7. Observa métricas, logs y alertas durante al menos una ventana de vigilancia.

No publiques si alguno de estos elementos falta: clave Accounts, HTTPS válido,
backup restaurable, rollback probado, alertas conectadas o cuenta demo.

## 15. Checklist final

- [ ] `ClientApplication(slug=taskflow)` creada y activa en Accounts.
- [ ] Clave Accounts rotada y guardada sólo en el secret manager/env seguro.
- [ ] Cuenta demo disponible y probada.
- [ ] Secrets de staging y producción separados.
- [ ] DNS resuelve correctamente.
- [ ] TLS válido y proxy apunta sólo a `127.0.0.1:10700`.
- [ ] `X-Forwarded-Proto=https` llega correctamente.
- [ ] GHCR y environments de GitHub configurados.
- [ ] Runner staging y producción disponibles.
- [ ] `check --deploy`, migraciones y builds pasan.
- [ ] Smoke HTTPS real de Accounts pasa.
- [ ] Backup diario configurado.
- [ ] Restore drill dentro de RPO/RTO.
- [ ] Rollback drill completado.
- [ ] Alertas conectadas y probadas.
- [ ] Revisión de accesibilidad completada.
- [ ] Smoke post-deploy de producción pasa.

## Archivos relacionados

- [Provisionar Accounts](accounts-provisioning.md)
- [Entornos](../development/environments.md)
- [Rollback](rollback.md)
- [Backup y restore](backup-restore.md)
- [Observabilidad](observability.md)
- [Informe de smoke](../qa/phase16-smoke-report.md)
- [Estado actual](../CURRENT_STATE.md)
