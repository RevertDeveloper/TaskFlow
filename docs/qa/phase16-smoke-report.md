# Informe de smoke de Phase 16

Este archivo registra únicamente evidencia ejecutada. Las credenciales nunca se
anotan aquí.

| Comprobación | Entorno | Resultado | Evidencia |
| --- | --- | --- | --- |
| Compose/configuración | local | PASS | Compose producción/staging y scripts validados |
| `check --deploy` | local aislado | PASS | release validation |
| migraciones | local aislado | PASS | migrate + collectstatic |
| Login Accounts real | staging HTTPS | PENDIENTE | navegador limpio |
| Logout y sesión expirada | staging HTTPS | PENDIENTE | estado UI |
| CSRF con/sin token | staging HTTPS | PENDIENTE | status HTTP |
| Backup y restore | staging aislado | PENDIENTE | timestamp y duración |
| Rollback | staging | PENDIENTE | release anterior |
| Lector de pantalla | navegador objetivo | PENDIENTE | signoff QA |
| Alertas | configuración local | PARCIAL | reglas versionadas; prueba de alerta pendiente |
