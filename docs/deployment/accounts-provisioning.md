# Provisionar la aplicación TaskFlow en Accounts

Este procedimiento requiere acceso de administración al repositorio
`carlosrevert-accounts`. La clave nunca se genera en TaskFlow, se copia a un
chat, se registra en logs ni se versiona.

1. Abrir Django Admin de Accounts con una cuenta de administración.
2. Crear o localizar `ClientApplication` con `slug=taskflow`, nombre TaskFlow,
   URL `https://taskflow.carlosrevert.es`, activa y consumidora de cuota.
3. Usar la acción **Rotar credencial de servicio**.
4. Copiar la clave mostrada una sola vez directamente al secret manager o al
   archivo de entorno seguro del host TaskFlow con permisos `0600`.
5. Configurar `ACCOUNTS_APPLICATION_SLUG=taskflow`,
   `ACCOUNTS_BASE_URL=https://cuenta.carlosrevert.es` y
   `ACCOUNTS_TASKFLOW_SERVICE_KEY` en API y worker.
6. Ejecutar el deploy controlado y verificar la reserva/validación de cuota con
   una cuenta de staging, sin anotar el valor de la clave.
7. Si hay sospecha de exposición, rotar de nuevo en Accounts y recrear API y
   worker. La clave anterior deja de ser válida.

La acción de rotación guarda únicamente un hash en Accounts. Un `seed` de
aplicaciones no debe crear ni imprimir credenciales internas.
