# Baseline de carga Sync

La comprobación mínima de carga usa el lote máximo del protocolo: 100
operaciones `create` de lista en una única llamada al servicio de push. No
incluye red, autenticación o el coste del navegador; sirve para detectar
regresiones del merge transaccional y de la idempotencia en el backend.

## Ejecución

```bash
cd apps/api
pytest tests/test_sync_load.py -q -s
```

## Resultado local

Última ejecución de Phase 9 en el entorno de desarrollo:

| Operaciones | Resultado | Tiempo |
|---:|---|---:|
| 100 | 100 accepted, 0 rejected, 0 conflicts | 210.28 ms |

El test falla por encima de 5 segundos. El valor impreso debe actualizarse en
esta tabla cuando cambien la base de datos, el hardware o la implementación
del merge. Para una capacidad operativa real todavía hace falta una prueba con
red y varias sesiones autenticadas.