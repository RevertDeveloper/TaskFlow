# Cobertura de la release candidate

## Baseline

Medición local del 2026-09-18 sobre el checkout de Phase 15:

| Suite | Comando | Resultado | Umbral del gate |
| --- | --- | --- | --- |
| Web | `npm run test:coverage` desde `apps/web` | 65 tests, 65.46% statements globales | 60% en las cuatro métricas |
| API | `python -m pytest --cov=apps --cov-report=term-missing --cov-fail-under=80 -q` | 127 tests, 87% de líneas | 80% de líneas |

La suite API usa `pytest-cov` en CI con `--cov-fail-under=80`. La cobertura de
branches y functions se observa en la suite web, pero no se fija todavía como
umbral API porque la medición base reproducible actual solo publica líneas.
Elevar el gate requiere una medición comparable y una decisión registrada, no
un porcentaje arbitrario.

## Comandos de release

```bash
cd apps/web
npm ci
npm run test:coverage

cd ../api
python -m pytest --cov=apps --cov-report=term-missing --cov-fail-under=80
```

El job de CI ejecuta estos comandos dentro del pipeline. Los informes HTML o
JSON locales son artefactos de diagnóstico y no contienen credenciales ni
datos de usuario.