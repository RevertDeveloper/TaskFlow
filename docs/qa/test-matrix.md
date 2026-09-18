# Matriz de pruebas de la release candidate

Estado de la matriz: 2026-09-18, Phase 15.

| Area | Casos mínimos | Evidencia | Estado |
| --- | --- | --- | --- |
| Auth | login, logout, expiración, bloqueada, anónima, CSRF | `apps/api/tests/test_accounts_authentication.py`, `test_accounts_auth_proxy.py`, `test_api_resources.py`, `apps/web/src/domain/auth/state.test.ts`, `apps/web/e2e/release-candidate.spec.ts` | PASS local por fixtures; smoke real deferred a Phase 16 salvo entorno staging explícito |
| Isolation | A/B, UUID guessing, sync/history/voice/reset | `apps/api/tests/test_api_resources.py`, `test_sync_api.py`, `test_voice_review.py` | PASS |
| Tasks | vacío, título largo, duplicado, completar/reabrir, delete, move | `apps/api/tests/test_domain_services.py`, `test_api_resources.py`, `apps/web/src/features/tasks/components/tasks.test.tsx`, E2E release candidate | PASS |
| Offline | crear/editar/completar, reconexión, retry | `apps/web/src/features/sync/SyncEngine.test.ts`, `StorageManager.test.ts`, `LocalRepository.test.ts` | PASS determinista |
| Sync | duplicate, conflict, dos dispositivos, cursor, tombstone | `apps/api/tests/test_sync_api.py`, `test_sync_load.py`, `apps/web/src/features/sync/ConflictResolver.test.ts`, `SyncTransport.test.ts` | PASS |
| Mode switch | vacío, igual, solo local, solo remoto, cambios y fallo | `apps/web/src/application/storage/StorageManager.test.ts`, `Snapshot.test.ts`, `LocalReplica.test.ts` | PASS |
| AI | JSON válido/inválido, múltiples tareas/listas, vacío, injection, lista inventada | `apps/api/tests/test_ai_extraction_contracts.py`, `test_ai_task_extraction.py`, `test_ai_quota.py`, `apps/web/src/features/voice/components/VoiceReview.test.tsx` | PASS |
| PWA | installability, update, privacidad de cache, app shell offline | `apps/web/src/app/manifest.ts`, `apps/web/public/sw.js`, E2E release candidate | PASS de contrato; instalación real de dispositivo deferred a Phase 16 |
| UX | desktop/tablet/mobile, teclado, lector, reduced motion | `apps/web/src/components/ui/components.test.tsx`, `apps/web/src/features/tasks/components/tasks.test.tsx`, Playwright desktop/mobile | PASS automatizado; lector real deferred a QA manual de staging |

## Ejecución

```bash
cd apps/web
npm run test:coverage
npm run test:e2e

cd ../api
python -m pytest --cov=apps --cov-report=term-missing --cov-fail-under=80
```

Los escenarios E2E deterministas mockean el transporte HTTP, no la lógica de
la aplicación: ejercitan rutas, cookies CSRF, navegación y estados renderizados
en un navegador real. El smoke de Accounts se activa sólo con variables de
entorno y nunca versiona credenciales.