# Informe de smoke de Phase 16

Este archivo registra únicamente evidencia ejecutada. Las credenciales nunca se
anotan aquí.

Última ejecución local: 2026-09-20.

| Comprobación | Entorno | Resultado | Evidencia |
| --- | --- | --- | --- |
| Compose/configuración | local | PASS | Compose producción/staging, preflight de release y scripts validados |
| Runtime productivo | local | PASS | Next standalone en `10700`, API en `10701`, sin `next-dev`/HMR; API, worker, PostgreSQL y Redis healthy |
| `/api/v1/auth/me/` anónimo | local y público | PASS | respuesta `authenticated=false`, sin redirect ni exposición de credenciales |
| Ruta privada anónima | HTTPS público | PASS | redirige a Accounts `/login/` con `next=https://taskflow.carlosrevert.es/` |
| `check --deploy` | local aislado | PASS | cero errores; warnings de drf-spectacular documentados |
| migraciones | local aislado | PASS | migrate + collectstatic |
| Login Accounts real | staging HTTPS | PENDIENTE | navegador limpio |
| Logout y sesión expirada | staging HTTPS | PENDIENTE | estado UI |
| CSRF con/sin token | staging HTTPS | PENDIENTE | status HTTP |
| Backup y restore | Compose aislado local | PASS | checksum OK, restore OK, migrate OK, `/api/ready=200` |
| Rollback | staging | PENDIENTE | release anterior |
| Lector de pantalla | navegador objetivo | PENDIENTE | signoff QA |
| Alertas | configuración local | PARCIAL | reglas versionadas; prueba de alerta pendiente |
