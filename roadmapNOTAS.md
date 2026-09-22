# Roadmap de refactorización: TaskFlow Notas

## Propósito y alcance

TaskFlow evolucionará de gestor de tareas a una aplicación de notas personal,
local-first y de captura inmediata. La referencia es Apple Notes como patrón de
uso, no como copia visual ni funcional: texto protagonista, creación rápida,
organización legible y herramientas que aparecen solo al editar.

`docs/InformeNOTAS.md` es investigación de producto, no instrucciones de
ejecución. Se adoptan captura primero y estructura después, primera línea como
título, jerarquía tipográfica, lista/cuadrícula, checklists y adjuntos. Se
difieren colaboración, OCR, cálculo, IA, smart folders, grafo y Kanban hasta
estabilizar el núcleo.

## Estado actual comprobado

| Área | Evidencia | Implicación |
| --- | --- | --- |
| Dominio | `Task` tiene título, descripción, estado, posición y `List`; no hay nota rica. | Crear `notes`; no reinterpretar tareas ni borrar datos. |
| Web | Next.js, `TaskWorkspaceProvider`, tablero, modal `TaskEditor` y Dexie de listas/tareas. | Sustituir la experiencia diaria por biblioteca y editor, conservando local-first. |
| API | Django/DRF con `external_user_id`, sync y auditoría. | Aplicar los mismos invariantes a notas y adjuntos. |
| Audio | `VoiceSession` almacena audio temporal y lo limpia. | No sirve como adjunto permanente. |
| Auth | Accounts es la identidad y TaskFlow es proxy same-origin. | Mantener sesiones/cookies; no añadir JWT, OAuth ni contraseñas locales. |

El árbol de trabajo estaba limpio durante el análisis. Este roadmap no modifica
código de producto ni configuración de producción.

## Decisiones previas

1. **Migración aditiva.** Se conservan `tasks`, `lists`, historial y colas de
   sync. La retirada o conversión de tareas será voluntaria, con vista previa,
   backup y ADR posterior.
2. **Documento estructurado.** Una nota persiste JSON versionado de bloques:
   párrafo, encabezado, checklist y adjunto. No se almacena HTML arbitrario ni
   se renderiza contenido de usuario con `dangerouslySetInnerHTML`.
3. **Título derivado.** La primera línea no vacía materializa `title` y no se
   duplica en el lienzo. Mientras está vacía se usa `Sin título` como nombre
   temporal accesible.
4. **Checklist con identidad.** Cada ítem tiene `id`, texto, estado, posición,
   indentación e hijos. Completar y mover una rama es una mutación idempotente,
   no una animación de cliente.
5. **Adjuntos desacoplados.** Los bloques solo referencian UUIDs; binarios y
   blobs no se guardan en el documento ni en la cola de sincronización.
6. **Mínimo visual.** La biblioteca muestra búsqueda, lista/cuadrícula, cuenta
   y `Nueva nota`. Ajustes, borrados e historial quedan fuera de la vista diaria.

## Fase 0 — Logout CSRF: diagnóstico y solución

### Hallazgo de código

La cadena actual es:

```text
Cerrar sesión
  -> POST /api/accounts/logout/ + X-CSRFToken=taskflowcsrftoken
  -> AccountsAuthProxy._proxy_headers()
  -> POST /api/v1/auth/logout/ de Accounts sin Referer
  -> CSRF Django Accounts: "Referer checking failed - no Referer"
```

`_proxy_headers()` en
`apps/api/apps/authentication/infrastructure/accounts_auth_proxy.py` solo deja
pasar `Cookie`, `Content-Type` y `X-CSRFToken`; por eso elimina `Referer`.
Existe un segundo riesgo que debe verificarse en staging: el cliente obtiene
`taskflowcsrftoken` desde `/api/v1/auth/csrf/` y hoy el proxy lo reenvía a
Accounts. Los secretos CSRF de ambas aplicaciones son distintos; el token de
TaskFlow no debe hacerse pasar por el de Accounts. Esto es una hipótesis de
flujo hasta validarla por HTTPS real.

### 0.1 Reproducción e instrumentación

1. Preparar staging HTTPS y una cuenta de demostración para ambos subdominios.
2. Añadir trazas temporales por `request_id`: ruta, método, resultado, presencia
   de `Referer` y resultado CSRF. Nunca valores de cookies, tokens, cuerpos o
   claves de servicio.
3. Ejecutar login, `/auth/me/`, logout y recarga; conservar HAR saneado y solo
   los atributos de `Set-Cookie`.
4. Comparar con un POST válido de Accounts y configuración efectiva de TLS,
   hosts, cookies y `CSRF_TRUSTED_ORIGINS`, sin imprimir secretos de Compose.

### 0.2 Implementación segura

1. Separar los límites CSRF:
   - TaskFlow emite y valida `taskflowcsrftoken` en cualquier POST browser a
     `/api/accounts/*`.
   - El proxy obtiene/renueva el CSRF de Accounts por
     `GET /api/accounts/csrf/`, conserva `Set-Cookie` y deriva su header desde
     la cookie de Accounts entrante.
2. El navegador remite al proxy solo el CSRF de TaskFlow; no se aceptará un
   header CSRF de Accounts controlado por el navegador.
3. Construir el `Referer` saliente desde `ACCOUNTS_BASE_URL`, por ejemplo
   `https://cuenta.carlosrevert.es/`, y no desde el header del navegador.
4. Conservar allowlist, bloqueo de redirects y veto a `Authorization`, claves
   internas y cabeceras arbitrarias.
5. Confirmar HTTPS, `Secure`, sesión Accounts en `.carlosrevert.es`,
   `SameSite=Lax` same-site y los orígenes CSRF estrictamente necesarios. No
   degradar a `SameSite=None` sin evidencia de un flujo cross-site.
6. Retirar trazas de detalle tras la prueba o reducirlas a métricas agregadas.

### Aceptación Fase 0

- [ ] POST sin CSRF TaskFlow válido devuelve 403 y no llega a Accounts.
- [ ] Accounts recibe solo el Referer configurado, nunca uno del navegador.
- [ ] Login/logout HTTPS funcionan; después, `/api/v1/auth/me/` es anónimo y
  las rutas privadas quedan denegadas.
- [ ] Tests: tokens/cookies ausentes, 403, timeout/503, redirect upstream y
  atributos seguros de `Set-Cookie`.
- [ ] No hay cookies/tokens en logs, fixtures, HARs ni mensajes de error.
