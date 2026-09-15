# Desarrollo local

TaskFlow es un monorepo con una aplicacion Next.js en `apps/web` y una API
Django/DRF en `apps/api`. Los contratos compartidos viven en `packages/` y la
infraestructura local en `infra/`.

La configuracion local se proporciona mediante variables de entorno. No se
deben copiar valores del entorno de produccion ni registrar secretos en el
repositorio. La plantilla de variables se añadira junto con la infraestructura
local de Phase 1.

Cada servicio debe conservar su limite de capa: la UI usa casos de uso y
repositorios, mientras que la API concentra la persistencia y la integracion
con servicios externos.