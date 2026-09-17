# Variables de entorno

La configuracion local parte de `.env.example`:

```bash
cp .env.example .env
docker compose --env-file .env -f compose.yaml -f compose.dev.yaml up --build
```

`.env` es local y esta excluido de Git. Los valores de ejemplo son de
desarrollo y no deben reutilizarse en staging o produccion.

## Variables por servicio

- `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` y `REDIS_PORT` reservan el bloque de
  puertos TaskFlow `10700`-`10720`.
- `DATABASE_URL` y `REDIS_URL` se consumen en API/worker. PostgreSQL y Redis se
  publican en loopback para desarrollo local, nunca como endpoints publicos.
- `ACCOUNTS_BASE_URL` y `ACCOUNTS_TIMEOUT_SECONDS` configuran el cliente
  server-side de Accounts que se implementara en Phase 2.
- `ACCOUNTS_TASKFLOW_SERVICE_KEY` es exclusivamente backend/worker. No debe
  aparecer en `NEXT_PUBLIC_*`, codigo cliente, logs ni respuestas HTTP.
- `ACCOUNTS_APPLICATION_SLUG` identifica la aplicacion `taskflow` en el contrato
  de cuota de Accounts. La clave de servicio se usa solo para validar, completar
  o fallar reservas desde API/worker.
- `AI_LLM_PROVIDER`, `AI_LLM_MAX_RETRIES` y `AI_MAX_LLM_RESPONSE_CHARS` limitan
  el provider, los reintentos de reparacion y el tamano de respuesta del LLM.
- `STORAGE_MODE` acepta `cloud` o `device` y se expone como
  `NEXT_PUBLIC_STORAGE_MODE` porque solo selecciona una estrategia de
  almacenamiento no sensible. `AI_*` y el resto de variables preparan los
  contratos de fases posteriores; no habilitan proveedores externos por si
  solos.

No se guardan secretos en el repositorio. Las variables `NEXT_PUBLIC_*` quedan
reservadas para valores publicos y no deben contener cookies, claves internas,
credenciales de base de datos o credenciales de proveedores AI.

En despliegues no locales, `DJANGO_SECRET_KEY`, la clave de Accounts y las
credenciales de servicios se inyectan desde el gestor de secretos del entorno.