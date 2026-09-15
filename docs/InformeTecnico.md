# ARQUITECTURA TÉCNICA DEFINITIVA

## Gestor Inteligente de Tareas — TaskFlow

**Versión:** 1.0
**Estado:** Arquitectura base aprobada
**Tipo:** Web App / PWA / Offline-first
**Frontend:** Next.js + React + TypeScript
**Backend:** Django + Django REST Framework
**Database:** PostgreSQL
**Local Storage:** IndexedDB
**Cache / Queue:** Redis
**Background jobs:** Celery
**AI pipeline:** STT + LLM mediante interfaces desacopladas
**Auth:** `carlosrevert_accounts`
**Deployment:** Docker
**Reverse Proxy:** Nginx Proxy Manager
**Objetivo arquitectónico:** Cloud + Device Mode + sincronización fiable sin acoplar la UI al almacenamiento.

---

# 1. DECISIÓN ARQUITECTÓNICA PRINCIPAL

La aplicación se dividirá en cinco grandes sistemas:

```text
┌─────────────────────────────────────────────┐
│                  FRONTEND                    │
│           Next.js / React / PWA             │
└───────────────────┬─────────────────────────┘
                    │ HTTPS / REST
                    ▼
┌─────────────────────────────────────────────┐
│                    API                       │
│            Django + DRF                     │
│                                             │
│ Auth Adapter                                │
│ Tasks                                       │
│ Lists                                       │
│ History                                     │
│ Sync                                        │
│ Voice Orchestration                         │
└──────────┬────────────┬────────────┬────────┘
           │            │            │
           ▼            ▼            ▼
      PostgreSQL      Redis       AI Worker
                                  │
                              ┌───┴────┐
                              │        │
                             STT      LLM
```

El frontend **nunca debe conocer detalles de PostgreSQL, Django, Redis o el proveedor de IA**.

Y, de forma inversa, el backend no debe conocer cómo se renderizan las tareas.

---

# 2. STACK DEFINITIVO

## Frontend

```text
Next.js
React
TypeScript
CSS Modules / Tailwind
Zustand
IndexedDB
Dexie
PWA
```

### Decisiones

**Next.js**

Será el framework principal de frontend.

Se utilizará principalmente como aplicación interactiva, aprovechando React y App Router.

La rama actual de Next.js 16 se encuentra activa en 2026.

---

**TypeScript**

Obligatorio.

No habrá JavaScript puro en código de aplicación.

---

**Zustand**

Se utilizará únicamente para estado de interfaz.

Ejemplo:

```text
activeList
selectedTask
sidebarOpen
voiceRecording
modal
theme
```

No utilizar Zustand como base de datos.

---

**Dexie**

Será la capa de acceso a IndexedDB.

La aplicación nunca accederá directamente a `indexedDB` desde componentes React.

---

# 3. BACKEND

## Django

Se recomienda:

```text
Django 5.2 LTS
```

frente a Django 6.0 para este proyecto, porque el objetivo es disponer de una base de mantenimiento prolongado. Django 5.2 LTS tiene soporte extendido hasta abril de 2028.

---

## Django REST Framework

Toda la API de aplicación utilizará:

```text
Django REST Framework
```

DRF mantiene soporte para las ramas actuales de Django y Python, por lo que encaja con el backend propuesto.

---

# 4. DATABASE

## PostgreSQL 18

La base de datos cloud será:

```text
PostgreSQL 18
```

La rama PostgreSQL 18 se encuentra actualmente estable en 2026.

No utilizaremos:

* MongoDB.
* Firebase.
* SQLite en producción.

---

# 5. REDIS

Redis tendrá dos funciones:

### Cache

Para elementos de lectura frecuente.

### Queue broker

Para trabajos asíncronos.

Ejemplo:

```text
Voice Processing
      ↓
Redis
      ↓
Celery Worker
```

---

# 6. CELERY

Los trabajos que puedan tardar o consumir recursos no deben bloquear una petición HTTP.

Ejemplos:

```text
process_voice
generate_transcription
process_llm
rebuild_history
cleanup_deleted_tasks
```

Flujo:

```text
POST /voice/process
        ↓
crear VoiceSession
        ↓
enqueue Celery task
        ↓
HTTP 202
        ↓
worker procesa
```

---

# 7. AI LAYER

La inteligencia artificial no estará directamente acoplada a Django views.

Arquitectura:

```text
Django
   ↓
AI Application Service
   ↓
STT Provider
   ↓
Transcript
   ↓
Task Extraction Service
   ↓
LLM Provider
   ↓
Validated JSON
```

---

# 8. ABSTRACCIONES DE IA

Crear interfaces:

```python
class SpeechToTextProvider:
    def transcribe(self, audio) -> Transcript:
        ...


class TaskExtractionProvider:
    def extract(
        self,
        transcript: str,
        lists: list
    ) -> TaskExtractionResult:
        ...
```

Esto permitirá sustituir:

```text
Whisper
```

por:

```text
otro STT
```

sin cambiar el resto de la aplicación.

Lo mismo para:

```text
LLM local
LLM API
Gemini
OpenAI
Qwen
etc.
```

---

# 9. AI PROVIDER ROUTER

Encima de los providers habrá:

```text
AIProviderRouter
```

Ejemplo:

```text
voice
 ↓
AIProviderRouter
 ↓
STT_LOCAL
 ↓
LLM_LOCAL
```

o:

```text
voice
 ↓
AIProviderRouter
 ↓
STT_API
 ↓
LLM_API
```

Configuración mediante variables de entorno:

```text
STT_PROVIDER=whisper
LLM_PROVIDER=qwen
```

---

# 10. NO BLOQUEAR EL PRODUCTO A UNA IA

La aplicación deberá asumir que la IA puede cambiar.

Nunca escribir:

```python
from openai import ...
```

directamente dentro de:

```text
views.py
models.py
serializers.py
```

La dependencia debe quedar confinada a:

```text
services/ai/providers/
```

---

# 11. MONOREPO

Recomendación:

```text
taskflow/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── contracts/
│   ├── types/
│   └── schemas/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
│
├── docs/
│
└── docker-compose.yml
```

---

# 12. FRONTEND STRUCTURE

```text
apps/web/

src/
├── app/
│   ├── (auth)/
│   ├── app/
│   │   ├── dashboard/
│   │   ├── lists/
│   │   ├── history/
│   │   └── settings/
│   │
│   └── layout.tsx
│
├── components/
│   ├── tasks/
│   ├── lists/
│   ├── history/
│   ├── voice/
│   ├── sync/
│   └── ui/
│
├── features/
│   ├── tasks/
│   ├── lists/
│   ├── history/
│   ├── voice/
│   ├── storage/
│   └── sync/
│
├── domain/
│   ├── task/
│   ├── list/
│   ├── history/
│   └── sync/
│
├── infrastructure/
│   ├── api/
│   ├── indexeddb/
│   └── repositories/
│
├── stores/
│
├── themes/
│
└── lib/
```

---

# 13. BACKEND STRUCTURE

```text
apps/api/

config/
├── settings/
│   ├── base.py
│   ├── development.py
│   └── production.py
│
├── urls.py
└── celery.py

apps/
├── authentication/
├── lists/
├── tasks/
├── history/
├── sync/
├── voice/
├── ai/
├── storage/
└── common/
```

---

# 14. PRINCIPIO DE DOMAIN MODULES

Cada módulo deberá contener:

```text
models
serializers
views
services
selectors
permissions
urls
tests
```

Ejemplo:

```text
tasks/
├── models.py
├── serializers.py
├── views.py
├── services.py
├── selectors.py
├── permissions.py
├── urls.py
└── tests/
```

---

# 15. DOMAIN SERVICE

La lógica importante nunca deberá estar únicamente en una API view.

Ejemplo:

```python
class CompleteTaskService:
    def execute(self, task, user):
        ...
```

Esto permite reutilizar la misma lógica desde:

* REST API.
* Importación.
* Sincronización.
* Tests.
* Futuras interfaces.

---

# 16. DATABASE SCHEMA

## users

No se creará una segunda tabla de usuarios funcional.

El sistema utilizará:

```text
external_user_id
```

proveniente de:

```text
carlosrevert_accounts
```

---

# 17. LISTS

```sql
CREATE TABLE lists (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    emoji VARCHAR(16),
    image_url TEXT,
    color VARCHAR(32),
    position NUMERIC NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
```

---

# 18. SYSTEM LIST: INBOX

Cada usuario tendrá una lista:

```text
Inbox
```

Con:

```text
is_system = true
```

La API deberá impedir su eliminación.

---

# 19. TASKS

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    list_id UUID NOT NULL,

    title VARCHAR(300) NOT NULL,
    description TEXT,

    status VARCHAR(32) NOT NULL,

    position NUMERIC NOT NULL DEFAULT 0,

    source VARCHAR(32) NOT NULL DEFAULT 'manual',

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);
```

---

# 20. TASK STATUS

MVP:

```text
pending
completed
```

Internamente preparado para:

```text
archived
deleted
```

No añadir estados innecesarios al MVP.

---

# 21. TASK SOURCE

Valores:

```text
manual
voice
ai
import
```

---

# 22. TASK EVENTS

```sql
CREATE TABLE task_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    task_id UUID,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL
);
```

---

# 23. EVENT TYPES

```text
TASK_CREATED
TASK_UPDATED
TASK_COMPLETED
TASK_REOPENED
TASK_MOVED
TASK_DELETED
TASK_RESTORED
```

Listas:

```text
LIST_CREATED
LIST_UPDATED
LIST_DELETED
LIST_RESTORED
```

---

# 24. POR QUÉ EVENT LOG

El historial visible no debe depender de cálculos complejos.

El sistema puede responder:

```text
¿Qué ocurrió con esta tarea?
```

consultando:

```text
task_events
```

Esto también será importante para sincronización.

---

# 25. SYNC OPERATIONS

Nueva entidad:

```sql
CREATE TABLE sync_operations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id UUID NOT NULL,
    operation VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL,
    client_id UUID NOT NULL,
    client_version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ
);
```

Esto permitirá implementar sincronización de manera explícita.

---

# 26. DEVICE ID

Cada instalación tendrá:

```text
device_id
```

UUID persistente.

Ejemplo:

```text
device_id = 5d8c...
```

No es un identificador de usuario.

Sirve exclusivamente para sincronización.

---

# 27. LOCAL DATABASE

IndexedDB tendrá stores equivalentes:

```text
lists
tasks
task_events
sync_operations
app_state
voice_sessions
```

---

# 28. LOCAL STORAGE

`localStorage` sólo tendrá preferencias ligeras:

```text
theme
storage_mode
device_id
ui_preferences
```

No guardar las tareas principales ahí.

---

# 29. REPOSITORY PATTERN

La UI interactuará con:

```typescript
interface TaskRepository {
    getAll(): Promise<Task[]>
    getById(id: string): Promise<Task | null>
    create(task: Task): Promise<Task>
    update(task: Task): Promise<Task>
    delete(id: string): Promise<void>
}
```

Implementaciones:

```text
ApiTaskRepository
IndexedDbTaskRepository
```

---

# 30. STORAGE MANAGER

Habrá una abstracción superior:

```typescript
interface StorageManager {
    getMode(): StorageMode
    getTasks(): Promise<Task[]>
    createTask(task): Promise<Task>
    updateTask(task): Promise<Task>
    completeTask(id): Promise<void>
}
```

Modos:

```text
cloud
device
```

El componente React no sabrá dónde se guarda la información.

---

# 31. CLOUD MODE

```text
React
 ↓
StorageManager
 ↓
CloudRepository
 ↓
REST API
 ↓
PostgreSQL
```

---

# 32. DEVICE MODE

```text
React
 ↓
StorageManager
 ↓
LocalRepository
 ↓
Dexie
 ↓
IndexedDB
```

---

# 33. OFFLINE-FIRST CLOUD MODE

Incluso Cloud Mode debe usar almacenamiento local como caché operacional.

Arquitectura:

```text
UI
 ↓
Local DB
 ↓
UI inmediata

        ↘
          Sync Engine
             ↓
           API
             ↓
          PostgreSQL
```

Esto hace que las acciones del usuario sean instantáneas.

---

# 34. SINGLE SOURCE OF TRUTH

Aquí hay una distinción importante.

### Dentro del dispositivo

IndexedDB es el estado operativo.

### En Cloud Mode

PostgreSQL es la autoridad remota.

### En Device Mode

No existe fuente remota.

Esto significa que:

```text
Cloud Mode
Local replica ↔ Cloud source
```

y:

```text
Device Mode
Local source
```

---

# 35. SYNC ENGINE

Crear módulo:

```text
features/sync/
```

con:

```text
SyncEngine
SyncQueue
ConflictResolver
SyncTransport
```

---

# 36. SYNC ALGORITHM

Cada modificación genera:

```text
local mutation
```

Ejemplo:

```text
TASK_COMPLETED
```

La operación se añade a:

```text
sync_operations
```

Después:

```text
SyncEngine
    ↓
batch operations
    ↓
POST /api/sync
```

El backend devuelve:

```text
accepted
rejected
conflicts
remote_changes
```

---

# 37. SYNC BATCHING

No enviar una petición por cada modificación.

Ejemplo:

```json
{
  "device_id": "...",
  "cursor": "...",
  "operations": [
    {},
    {},
    {}
  ]
}
```

Esto reduce tráfico y complejidad.

---

# 38. SERVER SYNC RESPONSE

```json
{
  "cursor": "9812",
  "accepted": [],
  "conflicts": [],
  "changes": []
}
```

El cursor permitirá solicitar únicamente cambios nuevos.

---

# 39. CONFLICT STRATEGY — MVP

Se utilizará:

```text
Last Write Wins
```

basado en:

```text
updated_at
```

Pero cada entidad tendrá también:

```text
client_id
version
```

para que el sistema pueda evolucionar posteriormente.

---

# 40. CLOUD → DEVICE

Flujo definitivo:

```text
User requests Device Mode
        ↓
Fetch cloud snapshot
        ↓
Validate snapshot
        ↓
Write IndexedDB
        ↓
Verify checksum/counts
        ↓
Activate Device Mode
```

La activación debe producirse **sólo después de verificar que la copia local es íntegra**.

---

# 41. DEVICE → CLOUD

```text
User requests Cloud Mode
        ↓
Build local snapshot
        ↓
Validate
        ↓
Upload changes
        ↓
Resolve conflicts
        ↓
Download server changes
        ↓
Finalize merge
        ↓
Activate Cloud Mode
```

Nunca cambiar el modo antes de completar correctamente la operación.

---

# 42. SNAPSHOT FORMAT

El sistema debe disponer de un formato de exportación interno común:

```json
{
  "schema_version": 1,
  "lists": [],
  "tasks": [],
  "task_events": [],
  "metadata": {
    "exported_at": "...",
    "device_id": "..."
  }
}
```

Ese formato servirá para:

* Sync.
* Backup.
* Import.
* Debug.
* Migración.

---

# 43. VOICE DATA MODEL

```sql
CREATE TABLE voice_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL,
    duration_ms INTEGER,
    transcript TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);
```

Estados:

```text
recording
uploaded
transcribing
transcribed
extracting
review
completed
failed
```

---

# 44. AUDIO STORAGE

Por defecto:

```text
audio original = temporal
```

No almacenar permanentemente.

Flujo:

```text
browser
 ↓
audio upload
 ↓
temporary storage
 ↓
STT
 ↓
delete audio
```

La conservación del audio será una futura opción explícita.

---

# 45. VOICE PIPELINE

```text
Microphone
    ↓
MediaRecorder
    ↓
Audio Blob
    ↓
POST /api/voice/process
    ↓
Temporary storage
    ↓
STT
    ↓
Transcript
    ↓
Task Extraction
    ↓
JSON Schema Validation
    ↓
Review
    ↓
Create Tasks
```

---

# 46. VOICE ENDPOINT

```http
POST /api/v1/voice/process
```

Respuesta inicial:

```json
{
  "session_id": "uuid",
  "status": "processing"
}
```

El frontend podrá consultar:

```http
GET /api/v1/voice/sessions/{id}
```

---

# 47. STRUCTURED AI OUTPUT

El LLM deberá producir:

```json
{
  "tasks": [
    {
      "title": "string",
      "description": "string|null",
      "list_id": "uuid",
      "confidence": 0.0
    }
  ]
}
```

Nada más.

---

# 48. JSON SCHEMA

El servidor validará obligatoriamente el resultado.

Si falla:

```text
LLM
 ↓
schema validation
 ↓
INVALID
```

no se crean tareas.

El sistema puede solicitar una segunda respuesta al modelo o mandar la sesión a revisión manual.

---

# 49. AI PROMPT ARCHITECTURE

No habrá un prompt gigante hardcoded en una view.

Separación:

```text
ai/
├── prompts/
│   ├── task_extraction.md
│   ├── task_classification.md
│   └── system.md
│
├── schemas/
│   └── task_extraction.json
│
└── services/
```

---

# 50. AI INPUT

El modelo recibirá:

```text
SYSTEM RULES

AVAILABLE LISTS

CURRENT LIST
(optional)

TRANSCRIPT
```

No debe recibir más información personal de la necesaria.

---

# 51. LIST CLASSIFICATION

Cada lista tendrá:

```text
name
description
```

Ejemplo:

```text
Programación
Desarrollo de software, servidores, código,
infraestructura y proyectos técnicos.
```

Esto aumenta la capacidad de clasificación semántica.

---

# 52. AI CONFIDENCE

La IA devolverá:

```text
confidence
```

pero el backend decidirá qué hacer.

Regla inicial:

```text
>= 0.85
→ aceptación normal

0.60-0.84
→ revisión

< 0.60
→ Inbox
```

Estos umbrales deberán convertirse posteriormente en configuración.

---

# 53. REVIEW UI

```text
┌─────────────────────────────────┐
│ He encontrado 4 tareas          │
│                                 │
│ 💻 Programación                 │
│ ☐ Revisar autenticación         │
│                                 │
│ 🏠 Casa                         │
│ ☐ Arreglar persiana             │
│                                 │
│ 🛒 Compra                       │
│ ☐ Comprar leche                 │
│                                 │
│ [Editar]             [Crear]    │
└─────────────────────────────────┘
```

La revisión será un objeto editable, no texto plano.

---

# 54. TASK UI

La tarjeta principal mostrará:

```text
☐ Terminar autenticación
```

Si existe descripción:

```text
☐ Terminar autenticación

   Revisar refresh token y middleware...
```

La descripción podrá expandirse.

---

# 55. TASK DETAIL

Al pulsar sobre una tarea:

```text
Task Detail

Título
Descripción

Lista

Creada
Última modificación
Completada

Historial
```

---

# 56. LIST NAVIGATION

## Desktop

Sidebar persistente.

## Mobile

Navigation horizontal:

```text
← Casa | Programación | Trabajo →
```

con gesto swipe.

Además:

```text
bottom sheet
```

para seleccionar cualquier lista rápidamente.

---

# 57. MOBILE NAVIGATION

Bottom bar:

```text
Home
Lists
🎙
History
Settings
```

El micrófono ocupará una posición de alta prioridad.

---

# 58. PWA

La aplicación tendrá:

```text
manifest
service worker
cache strategy
offline support
install experience
```

Una PWA requiere manifest para la instalación y los service workers son una tecnología habitual para añadir comportamiento offline.

---

# 59. PWA FEATURES

El manifest deberá definir como mínimo:

```text
name
short_name
icons
start_url
display
theme_color
```

El navegador necesita estos elementos para la experiencia instalable según las plataformas compatibles.

---

# 60. OFFLINE BEHAVIOR

### Device Mode

100% funcional sin conexión para las funciones locales.

### Cloud Mode

Funcionalidad básica:

```text
crear
editar
completar
mover
historial
```

y sincronización posterior.

### Voice

Requiere backend salvo que posteriormente se integre STT local en navegador.

---

# 61. THEMING

Se implementará:

```text
ThemeProvider
```

y tokens:

```css
--color-bg
--color-surface
--color-surface-elevated
--color-primary
--color-secondary
--color-text
--color-muted
--color-success
--color-warning
--color-danger
--radius-sm
--radius-md
--radius-lg
--shadow-card
```

---

# 62. THEME STRUCTURE

```text
themes/
├── stark.ts
├── minimal.ts
└── types.ts
```

La aplicación nunca dependerá directamente de:

```text
orange
blue
red
```

sino de:

```text
primary
success
danger
```

---

# 63. STARK THEME

Primera implementación:

```text
dark
glass
HUD
technical
high contrast
subtle animations
```

Pero el sistema visual será completamente independiente del dominio.

---

# 64. AUTHENTICATION

La aplicación utilizará:

```text
carlosrevert_accounts
```

como autoridad de identidad.

TaskFlow no gestionará:

```text
passwords
password reset
user registration
```

Estos procesos pertenecen al sistema de cuentas.

---

# 65. AUTH ADAPTER

El backend tendrá:

```text
authentication/
└── accounts_adapter.py
```

La finalidad es aislar el contrato de `carlosrevert_accounts`.

Internamente TaskFlow sólo necesita:

```python
AuthenticatedUser(
    external_user_id,
    email,
    display_name
)
```

---

# 66. CONTRATO DE AUTH RECOMENDADO

La integración ideal será mediante:

```text
short-lived access token
+
refresh/session managed by accounts
```

El backend TaskFlow verificará el token.

TaskFlow nunca confiará en:

```text
user_id
```

enviado por el navegador como autoridad.

---

# 67. API VERSIONING

Todos los endpoints empezarán por:

```text
/api/v1/
```

Ejemplos:

```text
/api/v1/lists
/api/v1/tasks
/api/v1/history
/api/v1/voice/process
/api/v1/sync
```

Esto permitirá crear:

```text
/api/v2/
```

sin romper clientes antiguos.

---

# 68. API RESPONSE FORMAT

Error:

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found"
  }
}
```

Éxito:

```json
{
  "data": {}
}
```

Colecciones:

```json
{
  "data": [],
  "meta": {}
}
```

---

# 69. HTTP STATUS CODES

Utilizar correctamente:

```text
200 OK
201 CREATED
202 ACCEPTED
204 NO CONTENT

400 BAD REQUEST
401 UNAUTHORIZED
403 FORBIDDEN
404 NOT FOUND
409 CONFLICT
422 UNPROCESSABLE ENTITY
429 TOO MANY REQUESTS
500 INTERNAL SERVER ERROR
```

---

# 70. API PAGINATION

No devolver:

```text
10.000 tareas
```

de una vez.

El historial utilizará paginación.

Ejemplo:

```text
limit
cursor
```

Preferiblemente cursor-based pagination para historial.

---

# 71. QUERY PATTERNS

Ejemplos:

```http
GET /api/v1/tasks?status=pending
GET /api/v1/tasks?list_id=uuid
GET /api/v1/history?cursor=...
```

---

# 72. INDEXES

PostgreSQL deberá tener al menos:

```text
tasks(user_id, status)
tasks(user_id, list_id, status)
tasks(user_id, updated_at)
tasks(user_id, completed_at)
task_events(user_id, created_at)
task_events(task_id, created_at)
lists(user_id, position)
```

---

# 73. MULTI-TENANCY

Todos los recursos estarán aislados por:

```text
user_id
```

Una consulta nunca podrá ser:

```python
Task.objects.get(id=task_id)
```

sin verificar propietario.

Debe utilizar:

```python
Task.objects.get(
    id=task_id,
    user_id=request.user.external_id
)
```

o, mejor, encapsular esa regla mediante selectors.

---

# 74. PERMISSIONS

Crear:

```text
IsAuthenticated
IsTaskOwner
IsListOwner
```

El objeto pertenece al usuario.

Nunca confiar únicamente en el frontend.

---

# 75. SECURITY

### HTTPS obligatorio.

### HttpOnly cookies/tokens según contrato de Accounts.

### CSRF cuando exista autenticación basada en cookies.

### CORS restringido.

### Rate limiting.

### Validación de uploads.

### Límite de duración/tamaño de audio.

### Sanitización del contenido presentado.

---

# 76. AUDIO SECURITY

El endpoint de audio deberá limitar:

```text
max file size
max duration
accepted MIME types
```

Por ejemplo:

```text
audio/webm
audio/mp4
audio/mpeg
```

No aceptar arbitrariamente cualquier binario.

---

# 77. LLM SECURITY

El contenido de la transcripción será tratado como:

```text
UNTRUSTED USER DATA
```

Nunca como instrucciones privilegiadas.

El sistema:

```text
system instructions
```

estará separado de:

```text
user transcript
```

---

# 78. OBSERVABILITY

Implementar desde el inicio:

```text
structured logs
request_id
user-safe error IDs
AI session IDs
sync operation IDs
```

No registrar automáticamente:

* contraseñas.
* tokens.
* audio.
* contenido privado innecesario.

---

# 79. ERROR TRACKING

Crear:

```text
request_id
voice_session_id
sync_id
```

para poder reconstruir errores.

Ejemplo:

```text
Voice failed

request_id:
abc123

session_id:
xyz456
```

---

# 80. TESTING

Tres niveles:

## Unit

```text
domain services
AI parsing
sync resolution
repositories
```

## Integration

```text
API + DB
API + auth
sync
voice pipeline
```

## E2E

```text
login
create task
complete task
switch list
voice creation
cloud/device switch
```

---

# 81. TEST CRÍTICO DE SINCRONIZACIÓN

El sync debe probar explícitamente:

```text
device A modifies task
device B modifies same task
```

y:

```text
device offline
device reconnects
```

También:

```text
cloud data + local data
```

durante el cambio de modo.

---

# 82. TEST MATRIX DE STORAGE

Debe existir una matriz:

| Caso        | Cloud | Device | Offline |
| ----------- | ----: | -----: | ------: |
| Crear tarea |     ✅ |      ✅ |       ✅ |
| Completar   |     ✅ |      ✅ |       ✅ |
| Editar      |     ✅ |      ✅ |       ✅ |
| Mover lista |     ✅ |      ✅ |       ✅ |
| Historial   |     ✅ |      ✅ |       ✅ |
| Voz         |     ✅ |     ✅* |       ⚠ |
| Sync        |     ✅ |      — |       ↔ |

`*` el Device Mode puede crear tareas manualmente offline; el procesamiento AI dependerá del backend mientras no exista STT/LLM local en el dispositivo.

---

# 83. RESET

Separar endpoints:

```text
DELETE /api/v1/account/data
```

y operación local:

```text
clearLocalData()
```

Nunca hacer que:

```text
Reset local
```

borre datos cloud.

---

# 84. RESET CLOUD

Debe exigir:

```text
confirmation token
```

o confirmación fuerte.

El backend realizará:

```text
tasks → deleted
lists → deleted/restored defaults
events → retained/cleaned according to policy
```

La política de retención se deberá definir explícitamente.

---

# 85. EXPORT

Endpoint:

```http
GET /api/v1/export
```

Generará:

```json
{
  "schema_version": 1,
  "lists": [],
  "tasks": [],
  "task_events": []
}
```

---

# 86. IMPORT

```http
POST /api/v1/import
```

El backend deberá:

```text
parse
validate
preview
commit
```

Nunca importar directamente sin validar.

---

# 87. DOCKER

Servicios iniciales:

```text
frontend
api
worker
postgres
redis
```

Opcional:

```text
nginx
```

si no se utiliza el reverse proxy externo.

---

# 88. DOCKER COMPOSE

Conceptualmente:

```text
services:

  web:
    Next.js

  api:
    Django

  worker:
    Celery

  postgres:
    PostgreSQL

  redis:
    Redis
```

No será necesario desplegar microservicios independientes para cada dominio.

---

# 89. NO MICROSERVICES PREMATUROS

La arquitectura será modular, pero no distribuida artificialmente.

Inicialmente:

```text
1 frontend
1 Django API
1 Celery worker
1 PostgreSQL
1 Redis
```

Esto permite escalar después sin introducir complejidad innecesaria.

---

# 90. AI WORKER

Aunque conceptualmente exista un AI service, inicialmente puede vivir dentro de:

```text
Celery Worker
```

Estructura:

```text
worker
├── STT
├── LLM
├── parsing
└── validation
```

Posteriormente, si el procesamiento AI exige GPU propia:

```text
Celery
 ↓
AI Service
 ↓
GPU
```

sin cambiar la API pública.

---

# 91. DEPLOYMENT

Arquitectura:

```text
Internet
   ↓
Cloudflare / DNS
   ↓
Nginx Proxy Manager
   ↓
TaskFlow Web
```

API:

```text
TaskFlow Web
   ↓
TaskFlow API
```

La API no necesita quedar públicamente expuesta si puede ser alcanzada a través del frontend/reverse proxy.

---

# 92. DOMINIO

Ejemplo:

```text
tasks.carlosrevert.es
```

API:

```text
tasks-api.carlosrevert.es
```

o, preferentemente:

```text
tasks.carlosrevert.es/api/*
```

La segunda opción simplifica CORS y mantiene una misma origin.

---

# 93. SAME-ORIGIN RECOMMENDATION

Recomendación:

```text
https://tasks.carlosrevert.es
```

Frontend:

```text
/
```

API:

```text
/api/v1/
```

Auth:

```text
accounts integration
```

Esto elimina gran parte de la complejidad de CORS.

---

# 94. VERSIONADO DE SCHEMA LOCAL

IndexedDB tendrá:

```text
DB_VERSION = 1
```

Cuando cambie el modelo:

```text
1 → 2
```

Dexie ejecutará migraciones.

Nunca borrar automáticamente una base antigua.

---

# 95. VERSIONADO DE DATOS

Cloud:

```text
schema_version
```

Local:

```text
schema_version
```

Export:

```text
schema_version
```

Esto es fundamental para evolucionar el producto.

---

# 96. DESIGN SYSTEM

Crear componentes reutilizables:

```text
Button
IconButton
Input
Textarea
Modal
Drawer
Dropdown
Tabs
Toast
Tooltip
Card
Badge
Checkbox
Avatar
```

Y componentes de dominio:

```text
TaskCard
TaskList
ListCard
ListSwitcher
HistoryEntry
VoiceRecorder
VoiceReview
SyncIndicator
```

---

# 97. ACCESSIBILITY

Objetivo:

```text
WCAG AA
```

Desde el principio:

* teclado.
* focus states.
* labels.
* aria.
* contraste.
* reduced motion.
* tamaños táctiles suficientes.

---

# 98. COMMAND PALETTE

Funcionalidad recomendada para desktop:

```text
Cmd/Ctrl + K
```

Ejemplos:

```text
Nueva tarea
Nueva lista
Buscar tarea
Ir a Casa
Ir a Programación
Abrir historial
Capturar por voz
Cambiar tema
```

Esto encaja especialmente bien con el concepto de "command center".

---

# 99. GLOBAL SEARCH

No es necesaria para MVP inicial, pero la arquitectura deberá permitir:

```text
GET /api/v1/search?q=
```

Buscará:

```text
tasks
lists
history
```

Posteriormente se puede ampliar con búsqueda semántica.

---

# 100. SEARCH FUTURE

No utilizar embeddings inicialmente.

La búsqueda textual normal será suficiente.

Más adelante:

```text
PostgreSQL Full Text Search
```

y sólo si aporta valor:

```text
pgvector
```

---

# 101. NOTIFICATIONS

Fuera del MVP.

Pero preparar modelo:

```text
reminder_at
```

posteriormente.

No añadirlo ahora al schema si no existe funcionalidad.

---

# 102. RECURRENT TASKS

Fuera del MVP.

No crear todavía:

```text
cron_expression
```

La arquitectura deberá permitir añadirlo posteriormente.

---

# 103. ATTACHMENTS

Fuera del MVP.

Cuando llegue:

```text
object storage
```

y no PostgreSQL blobs.

Ejemplo futuro:

```text
S3-compatible storage
```

---

# 104. AUDIT / PRIVACY POLICY

Separar:

### Product data

```text
tasks
lists
history
```

### Operational data

```text
logs
request IDs
metrics
```

### AI temporary data

```text
audio
transcript
```

Cada categoría tendrá una política diferente.

---

# 105. RETENTION

Por defecto:

```text
audio original → borrar tras STT
temporary files → borrar automáticamente
tasks → conservar
history → conservar
```

Más adelante configurable.

---

# 106. ANALYTICS

No introducir tracking invasivo.

Si se añaden métricas:

```text
task_created
task_completed
voice_processed
list_created
```

Nunca registrar contenido textual de la tarea como evento analítico salvo necesidad explícita.

---

# 107. ENVIRONMENT VARIABLES

Frontend:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_API_URL
```

Backend:

```text
DATABASE_URL
REDIS_URL

ACCOUNTS_BASE_URL
ACCOUNTS_PUBLIC_KEY / JWKS_URL

STT_PROVIDER
LLM_PROVIDER

STT_API_URL
LLM_API_URL

SECRET_KEY
```

Nunca introducir secrets en:

```text
NEXT_PUBLIC_*
```

---

# 108. CONFIGURATION LAYERS

```text
.env.development
.env.test
.env.production
```

Secrets sólo mediante:

```text
environment / secret manager
```

Nunca en Git.

---

# 109. CI/CD

Pipeline:

```text
git push
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
build
 ↓
Docker image
 ↓
deploy
 ↓
smoke tests
```

---

# 110. QUALITY GATES

No desplegar si falla:

```text
TypeScript
Python lint
Tests
Migration checks
Docker build
```

Para AI:

```text
JSON schema validation
```

también será obligatorio.

---

# 111. DATABASE MIGRATIONS

Django migrations.

Regla:

```text
migration → test → deploy
```

Nunca modificar producción manualmente.

---

# 112. BACKUPS

PostgreSQL:

```text
daily backup
```

y retención configurable.

Como mínimo:

```text
7 días
```

Más adelante:

```text
30 días
```

---

# 113. DISASTER RECOVERY

Debe poder reconstruirse:

```text
Docker containers
+
PostgreSQL backup
+
environment secrets
```

El frontend es reconstruible desde Git.

Los datos importantes son:

```text
PostgreSQL
```

y las configuraciones/secrets necesarias.

---

# 114. PRODUCT REPOSITORY

Estructura final:

```text
taskflow/
│
├── apps/
│   ├── web/
│   │
│   └── api/
│
├── packages/
│   ├── contracts/
│   └── schemas/
│
├── infra/
│   ├── docker/
│   ├── compose/
│   └── deployment/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── ai/
│   ├── sync/
│   └── decisions/
│
├── tests/
│
├── .github/
│   └── workflows/
│
└── README.md
```

---

# 115. ARCHITECTURE DECISION RECORDS

Crear:

```text
docs/decisions/
```

con ADRs.

Inicialmente:

```text
ADR-001 Next.js frontend
ADR-002 Django backend
ADR-003 PostgreSQL
ADR-004 IndexedDB
ADR-005 Repository abstraction
ADR-006 Cloud/Device modes
ADR-007 Sync strategy
ADR-008 AI provider abstraction
ADR-009 Event log
ADR-010 PWA
```

Esto evita volver a discutir decisiones ya tomadas.

---

# 116. ORDEN REAL DE IMPLEMENTACIÓN

La construcción no debe empezar por el STT.

Orden recomendado:

```text
01 Repository
02 Backend skeleton
03 Auth
04 PostgreSQL models
05 CRUD Lists
06 CRUD Tasks
07 History
08 Frontend UX
09 IndexedDB
10 Storage abstraction
11 Device Mode
12 Cloud Mode
13 Sync
14 PWA
15 STT
16 LLM
17 Voice Review
18 AI routing
19 Security hardening
20 Production
```

---

# 117. FASE 1 — FOUNDATION

Crear:

```text
monorepo
Next.js
Django
PostgreSQL
Redis
Docker
CI
```

Resultado:

```text
docker compose up
```

levanta todo.

---

# 118. FASE 2 — AUTH

Integrar:

```text
carlosrevert_accounts
```

Probar:

```text
una cuenta
→ TaskFlow
→ usuario autenticado
```

Validar aislamiento.

---

# 119. FASE 3 — CORE DOMAIN

Crear:

```text
List
Task
TaskEvent
```

y API:

```text
lists
tasks
history
```

---

# 120. FASE 4 — CORE UX

Crear:

```text
Dashboard
Sidebar
TaskCard
TaskEditor
ListSwitcher
History
```

Sin IA.

El usuario ya debe poder utilizar el producto completo manualmente.

---

# 121. FASE 5 — LOCAL DATABASE

Implementar:

```text
Dexie
IndexedDB
LocalRepository
```

y pruebas completas.

---

# 122. FASE 6 — STORAGE MANAGER

Crear:

```text
StorageManager
```

y conectar:

```text
CloudRepository
LocalRepository
```

Aquí se consigue una abstracción real entre modos.

---

# 123. FASE 7 — SYNC

Implementar:

```text
device_id
sync_operations
cursor
batch
merge
conflicts
```

Esta fase debe estar terminada antes de construir una UI compleja de settings de almacenamiento.

---

# 124. FASE 8 — PWA

Implementar:

```text
manifest
service worker
offline cache
install
```

La app debe poder instalarse como aplicación web.

---

# 125. FASE 9 — AI FOUNDATION

Implementar:

```text
VoiceSession
STT abstraction
LLM abstraction
JSON schema
Celery
```

Primero con un proveedor concreto.

---

# 126. FASE 10 — VOICE

Implementar:

```text
record
upload
transcribe
extract
review
create
```

---

# 127. FASE 11 — SMART ROUTING

Añadir:

```text
current list
available lists
list descriptions
confidence
Inbox fallback
```

---

# 128. FASE 12 — PRODUCTION HARDENING

Revisar:

```text
security
rate limiting
permissions
backup
logging
monitoring
recovery
data deletion
privacy
```

---

# 129. DEFINITION OF DONE — CORE

El núcleo estará terminado cuando:

```text
✅ Usuario autenticado
✅ Puede crear listas
✅ Puede crear tareas
✅ Puede mover tareas
✅ Puede completar tareas
✅ Puede reabrirlas
✅ Ve historial
✅ Funciona en móvil
✅ Funciona offline
✅ Device Mode funciona
✅ Cloud Mode funciona
✅ Cloud ↔ Device funciona
✅ No se pierden datos
```

---

# 130. DEFINITION OF DONE — AI

La IA estará terminada cuando:

```text
✅ Audio grabado
✅ STT correcto
✅ Múltiples tareas
✅ Descripciones separadas
✅ Clasificación
✅ JSON schema
✅ Review
✅ Creación
✅ Error handling
✅ Rate limiting
✅ Eliminación de audio temporal
```

---

# 131. ARQUITECTURA FINAL

```text
                         INTERNET
                            │
                            ▼
                 ┌────────────────────┐
                 │ NGINX PROXY MANAGER│
                 └──────────┬─────────┘
                            │
                  tasks.carlosrevert.es
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
      ┌─────────────┐              ┌──────────────┐
      │   Next.js   │              │    Django    │
      │    PWA      │─────────────▶│     API      │
      └──────┬──────┘              └──────┬───────┘
             │                            │
             │                            ├──────────────┐
             │                            │              │
             ▼                            ▼              ▼
        IndexedDB                    PostgreSQL       Redis
             │                            │              │
             │                            │              ▼
             │                            │           Celery
             │                            │              │
             │                            │              ▼
             │                            │         AI Pipeline
             │                            │              │
             │                            │         ┌────┴────┐
             │                            │         ▼         ▼
             │                            │        STT       LLM
             │                            │
             └────────── Sync ────────────┘
```

---

# 132. PRINCIPIO FUNDAMENTAL DEL PROYECTO

La arquitectura queda resumida en esta regla:

```text
UI
 ↓
Domain
 ↓
Repository
 ↓
Storage
```

Nunca:

```text
UI
 ↓
API directamente
```

ni:

```text
UI
 ↓
IndexedDB directamente
```

ni:

```text
UI
 ↓
LLM directamente
```

---

# 133. RESULTADO

La arquitectura permite evolucionar el producto en todas estas direcciones sin reconstruir el núcleo:

```text
                    TASKFLOW
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Manual         Voice          Future AI
        │              │              │
        └──────────────┼──────────────┘
                       │
                     DOMAIN
                       │
               ┌───────┴───────┐
               │               │
             CLOUD           DEVICE
               │               │
          PostgreSQL        IndexedDB
               │               │
               └────── SYNC ───┘
```

La aplicación queda preparada para añadir posteriormente:

```text
prioridades
fechas
recordatorios
recurrentes
subtareas
tags
attachments
calendario
notificaciones
IA personalizada
búsqueda semántica
```

sin modificar los principios fundamentales.

---

# 134. ESTADO DE ARQUITECTURA

## Fijado

```text
Frontend:       Next.js + React + TypeScript
Backend:        Django + DRF
Database:       PostgreSQL
Queue:          Redis + Celery
Local DB:       IndexedDB + Dexie
PWA:            Sí
Auth:           carlosrevert_accounts
Storage:        Cloud + Device
Sync:           Engine propio
AI:             STT + LLM abstraídos
History:        Event log
API:            REST /v1
Deployment:     Docker
Themes:         Design-token based
```

## No acoplado

```text
Proveedor STT
Proveedor LLM
Proveedor object storage futuro
Proveedor de observabilidad
Proveedor de hosting
```

Esto es deliberado.

---

# 135. PRIMER MILESTONE REAL

El primer objetivo del repositorio no será:

> "Tener la IA funcionando."

Será:

> **Tener una aplicación de tareas completamente funcional, autenticada, con PostgreSQL, IndexedDB, PWA y Cloud/Device Mode, pero todavía sin IA.**

Cuando eso funcione perfectamente, añadir STT + LLM será una extensión sobre una plataforma estable en lugar de construir el producto alrededor de la parte más impredecible.

---

# 136. DEFINICIÓN DEL PRODUCTO

La arquitectura completa queda finalmente reducida a cinco pilares:

```text
1. TASK MANAGEMENT
2. INTELLIGENT CAPTURE
3. CLOUD / DEVICE PRIVACY
4. RELIABLE SYNCHRONIZATION
5. FAST COMMAND-CENTER UX
```

La IA es el gran diferenciador, pero **el núcleo del producto es el sistema de datos + sincronización + UX**.

Por ello, esos tres elementos deben diseñarse correctamente antes de introducir complejidad adicional.
