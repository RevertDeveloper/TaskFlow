# Checklist QA de release candidate

Fecha de ejecución local: 2026-09-18.

La ejecución Playwright de release candidate terminó con `9 passed, 0 failed,
3 skipped` en los proyectos desktop y mobile Chromium. Los skips corresponden
al caso móvil cuando se ejecuta fuera de su proyecto y al smoke de Accounts
real cuando no se proporcionan variables de staging.

| Comprobación | Evidencia | Resultado |
| --- | --- | --- |
| Desktop | Playwright `desktop`, CRUD, historial, voz, PWA y reset | PASS |
| Mobile | Playwright `mobile`, navegación principal y viewport responsive | PASS |
| Red lenta/offline | `SyncEngine.test.ts`, `StorageManager.test.ts`, `LocalReplica.test.ts` | PASS determinista |
| Entradas inválidas | validadores de dominio, serializers, API y formularios web | PASS |
| Sesión expirada/anónima/bloqueada | `test_accounts_authentication.py`, `state.test.ts` | PASS por fixtures |
| Empty states | suites de tareas, listas e historial | PASS |
| Dataset grande | `test_phase14_performance_baseline.py`, `phase14-performance-baseline.test.ts` | PASS con baseline registrado |
| Micrófono denegado | `VoiceRecorder.test.tsx`, `audio.test.ts` | PASS |
| Proveedor no disponible | `test_voice_infrastructure.py`, `test_ai_quota.py`, `VoiceReview.test.tsx` | PASS fail-closed |
| Reset/import | `StorageManager.test.ts`, `Snapshot.test.ts`, E2E reset con confirmación | PASS |
| Typecheck API | `mypy config` | BLOCKED: TF-1509, 80 diagnósticos heredados en 24 archivos; owner: mantenimiento API |
| Accounts real sobre HTTPS | smoke con variables de staging | DEFERRED a Phase 16 |
| Lector de pantalla físico | revisión manual en navegador objetivo | DEFERRED a QA de staging |

## Criterio de cierre

La suite automatizada y la cobertura son gates de CI. Las filas `DEFERRED`
dependen de staging o de hardware/servicios externos que el roadmap asigna a
Phase 16; no se presentan como validaciones reales completadas. El bloqueo
TF-1509 debe cerrarse con `mypy config` sin diagnósticos antes de marcar Phase
15 como PASS formal.