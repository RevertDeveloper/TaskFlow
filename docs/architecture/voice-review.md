# Revisión de tareas de voz

## Flujo

La voz sigue esta secuencia obligatoria:

`audio -> STT -> transcript -> LLM -> schema -> routing -> review -> confirmation -> tasks`

La salida del proveedor nunca se escribe directamente en `Task`. El servicio de extracción valida el JSON del proveedor y el servicio de review valida de nuevo el payload antes de persistir `VoiceReviewDraft`.

## Routing

El backend obtiene las listas activas del usuario autenticado y crea Inbox si todavía no existe. La prioridad es:

1. lista explícita indicada por el usuario;
2. lista de contexto actual, si sigue activa y pertenece al usuario;
3. clasificación semántica cuando supera `AI_CLASSIFICATION_CONFIDENCE_THRESHOLD`;
4. Inbox para resultados ambiguos, inválidos o por debajo del umbral.

Nunca se crea una lista automáticamente. Los UUID de listas se validan contra las listas del usuario tanto al generar el draft como al confirmar.

## Draft y privacidad

`VoiceReviewDraft` es una fila one-to-one con `VoiceSession`. Guarda solo tareas estructuradas, clasificación, confianza y metadatos de fuente validados por `apps/voice/schemas/review_draft.schema.json`. No guarda audio ni copia el transcript.

El draft caduca según `AI_REVIEW_DRAFT_TTL_SECONDS` (30 minutos por defecto). Una nueva generación reutiliza la fila caducada y una generación repetida de un draft confirmado devuelve la misma fila sin volver a invocar el proveedor.

Al confirmar, el transcript se purga si `transcript_retention` es falso. La preferencia no conserva audio.

## Confirmación

La UI envía solo las tareas seleccionadas y editadas junto con una `idempotency_key`. El backend bloquea el draft, vuelve a validar ownership/listas y crea tareas `source=ai` y sus eventos dentro de una transacción. Un reintento con la misma clave devuelve las mismas tareas; una clave distinta no puede volver a crear el draft confirmado.

Un fallo de validación de una tarea revierte toda la confirmación. Una lista ajena, eliminada o archivada no se acepta silenciosamente.

## Configuración

- `AI_CLASSIFICATION_CONFIDENCE_THRESHOLD`: umbral configurable entre 0 y 1; no representa una métrica de accuracy.
- `AI_REVIEW_DRAFT_TTL_SECONDS`: TTL mínimo efectivo de 60 segundos.
- `ACCOUNTS_QUOTA_MODE`: la generación de review consume la cuota de `voice_task_extraction`; la confirmación manual no consume cuota.

La validación real contra Accounts continúa diferida al smoke de staging de Phase 16.
