# Politica de retencion de voz

## Alcance

Esta politica describe el pipeline de voz de Phase 11. Accounts sigue siendo la
fuente de identidad y cada `VoiceSession` se consulta filtrando por
`external_user_id`.

## Audio original

- El navegador conserva la grabacion en memoria hasta enviarla como
  `multipart/form-data`; no se guarda en IndexedDB, el service worker ni el API
  de respuestas.
- El API valida MIME real, extension, tamano y duracion antes de escribir.
- El archivo se escribe en un directorio temporal por UUID de sesion. El modelo
  `VoiceSession` nunca contiene bytes ni una ruta de audio permanente.
- El API devuelve estado, transcript y metadatos seguros, nunca el archivo de
  audio.

## Ciclo de vida

1. Una subida valida se marca como `uploaded` y se encola en Celery; la
   peticion HTTP no ejecuta STT.
2. Si la cola no esta disponible, el API intenta eliminar el audio y marca la
   sesion como `failed`. Si esa limpieza falla, usa `audio_cleanup_failed` para
   que el residuo no quede oculto.
3. Un timeout o una indisponibilidad del provider conserva el archivo solo para
   el retry controlado. Al agotar retries, la sesion termina en `failed` y se
   intenta limpiar.
4. En exito, transcript vacio, transcript demasiado grande o error terminal de
   provider, el audio se elimina antes de guardar el resultado final.
5. Si una limpieza falla, la sesion queda en estado terminal y con un codigo
   seguro; el directorio debe tratarse como incidente operativo, no como dato
   de dominio valido.

## Transcript

El transcript se guarda en `VoiceSession` durante Phase 11 para que el cliente
pueda hacer polling y para que Phase 13 pueda iniciar la revision. El campo
`transcript_retention` se conserva como preferencia de contrato, pero su
semantica de purga posterior pertenece a Phase 13/14; Phase 11 no implementa
una retencion indefinida ni un TTL de transcript.

## Limites y residual conocido

Los limites configurados son 25 MB y 300 segundos por defecto. No se registran
bytes de audio, cookies, prompts ni payloads privados. Celery usa acknowledgements
tardios para permitir redelivery si un worker muere. Un proceso que muera antes
de completar el ciclo puede dejar un directorio de staging; el reaper/TTL y la
politica de observabilidad correspondiente quedan asignados al hardening de
Phase 14.
