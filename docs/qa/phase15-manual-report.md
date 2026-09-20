# Informe manual de Phase 15

Fecha: 2026-09-18

La evidencia automatizada de Phase 15 esta cerrada. Quedan dos validaciones
manuales que dependen de staging o de hardware y que el roadmap asigna a
Phase 16. No deben bloquear el arranque de la preparacion de staging.

## 1. Smoke real de Accounts en staging

**Responsable:** quien tenga acceso al entorno de staging y a una cuenta de
pruebas de Accounts.

**Necesario:**

- dominio HTTPS de staging de TaskFlow;
- cuenta de prueba de Accounts, nunca una credencial personal en logs;
- variables de staging exigidas por `apps/web/e2e/auth.spec.ts`;
- Chromium con una ventana limpia.

**Pasos:**

1. Abrir TaskFlow sin cookies previas y confirmar que el estado inicial es
   anonimo.
2. Iniciar sesion desde el flujo delegado a Accounts y recargar la pagina.
3. Confirmar que `/api/v1/auth/me/` de TaskFlow informa la identidad correcta
   sin exponer la cookie HttpOnly ni tokens en el navegador.
4. Crear una tarea, cerrar la sesion y recargar; la vista privada debe quedar
   bloqueada y no mostrar datos anteriores.
5. Invalidar o dejar caducar la sesion en Accounts, recargar TaskFlow y
   confirmar el estado de sesion expirada.
6. Repetir una mutacion con CSRF valido y comprobar que una mutacion sin CSRF
   recibe rechazo; no guardar cuerpos de peticion ni cookies como evidencia.
7. Iniciar sesion en `cuenta.carlosrevert.es`, abrir TaskFlow en otra pestana
   y confirmar que la sesion compartida funciona; cerrar sesion global y
   confirmar que TaskFlow queda anonimo.

**Evidencia:** fecha, entorno, resultado de cada paso, `X-Request-ID` de los
fallos y captura sin datos personales. Guardar el resultado en el sistema de
incidencias o como artefacto privado de staging.

## 2. Revision con lector de pantalla

**Responsable:** una persona con lector de pantalla disponible.

**Pasos:**

1. Usar solo teclado para entrar, navegar por sidebar/bottom navigation,
   cambiar de lista, crear una tarea y abrir/cerrar el editor.
2. Confirmar que el foco visible no se pierde y que los dialogos devuelven el
   foco al control que los abrio.
3. Verificar con lector de pantalla los nombres de botones icon-only, estados
   de carga/error, contador de pendientes, tabs y mensajes toast.
4. Repetir en viewport movil y con `prefers-reduced-motion` activo.
5. Registrar cualquier problema con ruta, paso reproducible, navegador,
   lector y severidad; no cerrar Phase 16 si existe un bloqueo de teclado o
   una accion sin nombre accesible.

## Criterio de entrega a Phase 16

La Phase 15 puede darse por cerrada para iniciar Phase 16 porque sus pruebas
automatizadas y el bloqueo TF-1509 estan resueltos. Las dos validaciones de
este informe deben aparecer como `DEFERRED` hasta ejecutarse en el entorno que
les corresponde; no se deben marcar como PASS por evidencia de fixtures.
