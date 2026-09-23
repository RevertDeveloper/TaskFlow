# Informe de cierre y Fase 5 de producción

**Repositorio:** `/home/revert/Repositorios/TaskFlow`  
**Fecha:** 2026-09-22  
**Objetivo:** dejar TaskFlow reconstruible, utilizable, verificable y publicable con evidencia reproducible.

## 1. Diagnóstico actual

### Ya implementado

- Dominio legacy de tareas y listas con persistencia local, sincronización y API Django.
- Autenticación delegada a Accounts y proxy same-origin.
- Aplicación de notas con bloques estructurados, IndexedDB, carpetas, tags, búsqueda local y vistas lista/galería.
- Checklists con ordenación, indentación, soft return y undo.
- Fase 4 parcial: secciones colapsables, atajos de teclado, scoring de búsqueda y modelo de resaltado bicolor.
- Compose de desarrollo y producción, imágenes Docker, healthchecks, migraciones, backups, rollback y reglas de alertas versionadas.
- Frontend validado en el último cambio de notas con typecheck, lint, tests y build.

### Pendiente funcional de notas

- Renderizado editable de spans parciales: el modelo soporta resaltado, pero los `input`/`textarea` actuales no muestran formato dentro de la edición.
- Pruebas e2e de colapsar/reabrir una nota y comprobar persistencia.
- Virtualización real o ventana de renderizado para notas de más de 200 bloques.
- Benchmark formal de escritura con 2.000 bloques.
- Conversión no destructiva de listas legacy a notas.
- Enlaces `>>`, resolución `note://`, backlinks y autocompletado.
- Movimiento de notas mediante drag-and-drop o menú contextual.
- Auditoría manual de accesibilidad de la experiencia de notas.

### Pendiente de producción global

- Ejecutar la suite backend en un entorno con sus dependencias instaladas; el entorno usado en la última sesión carecía de `celery`.
- Crear o verificar la aplicación `taskflow` en Accounts y custodiar `ACCOUNTS_TASKFLOW_SERVICE_KEY`.
- Configurar secretos independientes de staging y producción.
- Configurar DNS, HTTPS, cookies compartidas y CSRF entre Accounts y TaskFlow.
- Ejecutar login/logout real, expiración de sesión y protección CSRF sobre HTTPS.
- Ejecutar rollback contra una release anterior real.
- Conectar Prometheus/Alertmanager y disparar al menos una alerta de prueba.
- Completar revisión manual con lector de pantalla y teclado en los navegadores objetivo.
- Registrar evidencias de release y aprobación final.

## 2. Fase 5: Cierre personal y producción real

> Esta fase no añade una funcionalidad aislada. Es el ciclo final de revisión, reconstrucción, endurecimiento y publicación. Ningún criterio se marca como completo sólo porque exista código: debe existir una prueba o evidencia fechada.

### 5.1 Inventario y reconciliación

- [ ] Comparar `docs/RoadmapAppleNotas.md`, `docs/CURRENT_STATE.md` y `docs/ROADMAP.md`.
- [ ] Resolver qué roadmap es la fuente principal y enlazar los otros sin estados contradictorios.
- [ ] Revisar todos los `[ ]` y `[~]` de las fases anteriores.
- [ ] Clasificar cada pendiente como `implementar`, `validar`, `bloqueado externo` o `fuera de alcance`.
- [ ] Crear una matriz final de requisitos con archivo, prueba y evidencia.

### 5.2 Cierre funcional de notas

Orden recomendado:

1. Completar editor enriquecido con un modelo editable que pueda mostrar spans, saltos de línea, links y highlights sin `dangerouslySetInnerHTML`.
2. Implementar y probar `>>`, enlaces `note://`, backlinks y actualización de títulos enlazados.
3. Añadir movimiento de notas entre carpetas y revisar profundidad, tombstones y conflictos.
4. Implementar virtualización o una ventana estable para documentos largos.
5. Implementar la conversión no destructiva de listas a notas con vista previa y prueba de invariantes.
6. Añadir pruebas e2e desktop/mobile para crear, editar, buscar, colapsar, resaltar, reabrir, mover y sincronizar.
7. Ejecutar auditoría de accesibilidad: foco, teclado, lector de pantalla, contraste, nombres accesibles y reduced motion.

### 5.3 Reconstrucción reproducible desde cero

La reconstrucción debe ejecutarse en un checkout limpio o en una máquina nueva. No se deben reutilizar `node_modules`, `.next`, volúmenes ni bases de datos de una ejecución anterior.

```bash
git clone <URL_DEL_REPOSITORIO> TaskFlow
cd TaskFlow
git checkout main
cp .env.example .env
make config
make check-ports
make up
make migrate
make ps
```

Después:

```bash
cd apps/web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
cd ../api
python3 -m pytest
python3 manage.py check
```

Si se usa Docker como entorno de validación, los checks backend se ejecutan dentro del servicio `api` para garantizar que `celery`, Django y las dependencias fijadas estén presentes. La reconstrucción debe conservar los datos legacy y completar las migraciones de IndexedDB sin pérdida.

### 5.4 Preparación de staging

- [ ] Crear una stack aislada con proyecto Compose, base de datos, Redis, secretos y dominio propios.
- [ ] Crear `ClientApplication` `taskflow` en Accounts o habilitar el origen de staging aprobado.
- [ ] Configurar una cuenta demo de QA, nunca una cuenta personal.
- [ ] Ejecutar migraciones y smoke de salud/readiness.
- [ ] Probar login, logout, sesión expirada, CSRF, cookies, creación de tarea y creación de nota.
- [ ] Probar sincronización, conflictos, tombstones y recuperación tras offline.
- [ ] Ejecutar Playwright desktop/mobile y guardar el informe.
- [ ] Ejecutar Lighthouse y revisión manual de accesibilidad.

### 5.5 Publicación y operación

- [ ] Construir imágenes con un tag inmutable de release.
- [ ] Escanear imágenes y dependencias.
- [ ] Ejecutar el workflow de release con gates aprobados.
- [ ] Aplicar migraciones compatibles antes de cambiar el tráfico.
- [ ] Comprobar `/health/`, `/api/ready` y métricas protegidas.
- [ ] Conectar scrape de Prometheus y recepción de Alertmanager.
- [ ] Disparar una alerta controlada y verificar resolución.
- [ ] Ejecutar backup, checksum y restauración aislada.
- [ ] Ejecutar rollback de aplicación a la release anterior.
- [ ] Verificar que el rollback no rompe datos ni sesiones de Accounts.
- [ ] Registrar release, commit, migraciones, evidencias y responsable.

## 3. Criterios de salida

La Fase 5 sólo puede marcarse `[x]` cuando se cumplan todos estos puntos:

| Área | Evidencia mínima |
|---|---|
| Código | diff revisado, sin secretos, sin `dangerouslySetInnerHTML` nuevo en notas |
| Frontend | lint, typecheck, tests, build y Playwright desktop/mobile |
| Backend | dependencias instaladas, pytest, Django checks, migraciones y contrato OpenAPI |
| Datos | migración IndexedDB v3, backup/restore y prueba de tombstones |
| Seguridad | revisión de auth, CSRF, cookies, headers, inputs y secretos |
| Accesibilidad | teclado, foco, lector de pantalla y Lighthouse documentados |
| Operación | health/readiness, logs, métricas, alertas y backup verificados |
| Despliegue | staging HTTPS, smoke Accounts real y rollback contra release anterior |
| Documentación | estado actualizado, runbook ejecutable y evidencia fechada |

## 4. Bloqueadores actuales

- `ACCOUNTS_TASKFLOW_SERVICE_KEY` no está provisionada en este workspace.
- El último intento de backend local falló porque el intérprete disponible no tenía instalado `celery`.
- No existe todavía evidencia real de staging HTTPS, rollback contra una release anterior, alert delivery ni signoff manual de accesibilidad.
- El resaltado parcial y la virtualización de notas siguen siendo trabajo de producto, no sólo tareas de documentación.

## 5. Orden de trabajo recomendado

1. Reconciliar roadmaps y cerrar las brechas funcionales de notas que bloqueen la experiencia principal.
2. Preparar un entorno reproducible y ejecutar todos los checks dentro de Docker o un entorno Python fijado.
3. Completar staging externo con Accounts real y recopilar evidencia.
4. Corregir los fallos encontrados y repetir desde una reconstrucción limpia.
5. Publicar una release inmutable, probar alertas, backup y rollback.
6. Firmar el cierre sólo cuando la matriz de salida esté completa.
