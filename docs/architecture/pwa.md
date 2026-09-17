# PWA y funcionamiento offline

## Manifest

Next.js genera `/manifest.webmanifest` desde `apps/web/src/app/manifest.ts`.
Incluye nombre, nombre corto, ruta de inicio `/app/dashboard`, scope raiz,
display `standalone`, colores de marca e iconos SVG en tamanos 192 y 512.

## Service worker

`public/sw.js` usa caches versionadas `taskflow-public-vN`.

- Cachea solo `/_next/static/*`, iconos, manifest y `offline.html`.
- Nunca cachea `/api/*` ni respuestas privadas de navegacion como datos publicos.
- Las navegaciones de `/app/*` van a red y usan `offline.html` solo si la red
  falla.
- Al activar una version nueva elimina caches antiguas y reclama clientes.
- La actualizacion no reemplaza la pagina automaticamente: la UI muestra un
  aviso y el usuario decide cuando activar el worker en espera.

La voz no se anuncia como disponible offline. Las sesiones de voz requieren el
backend y sus politicas de retencion de Phase 11.

## Indicadores

La sidebar consume exclusivamente `StorageState` y distingue:

- `Sincronizado`: autoridad remota disponible y sin operaciones pendientes.
- `Sincronizando`: una ejecucion de `SyncEngine` esta activa.
- `Pendiente`: existen operaciones locales aun no procesadas.
- `Solo dispositivo`: IndexedDB es autoridad y no se ejecuta sync remoto.
- `Sin conexion`: el navegador esta offline y la cola queda pausada.
- `Error de sincronizacion`: existe un error accionable conservando la replica.

## Privacidad

El service worker no intercepta ni guarda cookies, payloads, respuestas API,
audio, prompts o respuestas de proveedores. IndexedDB sigue siendo el unico
lugar de datos de trabajo local y su borrado se ofrece separado del borrado
Cloud y de la baja de Accounts.
