# Plan de Implementación Técnico

> **Repositorio:** `/home/revert/Repositorios/TaskFlow`
> **Referencia funcional:** `docs/InformeNOTAS.md` (análisis arquitectónico de Apple Notes)
> **Modelo de ejecución:** Migración aditiva — el dominio `tasks/lists` existente se conserva intacto durante todas las fases; el nuevo dominio `notes` convive en paralelo hasta que la conversión sea voluntaria y verificada.
> **Fecha de redacción:** 2026-09-22

## Estado de ejecución al 2026-09-22

| Fase | Estado | Commit | Resultado |
|---|---|---|---|
| **Fase 1** | Implementada con pendientes de producto | `ab0e4b2` | Workspace de notas, sidebar, drawer móvil, biblioteca lista/galería, preferencias locales y editor de captura inicial. |
| **Fase 2** | Implementada en el núcleo técnico | `956ad70` | Dominio estructurado, IndexedDB v3, renderizador seguro, checklists, undo, API Django, validación recursiva y sync de notas. |
| **Fase 3** | Implementada parcialmente | — | Carpetas y tags locales, biblioteca conectada a IndexedDB, filtros y sync de carpetas; enlaces `>>`, backlinks y DnD quedan pendientes. |

**Convención de aceptación:** `[x]` validado por código y pruebas; `[~]` existe de forma parcial o requiere completar interacción; `[ ]` no implementado.

**Verificación de cierre realizada:** frontend con `npm run typecheck`, `npm run lint`, `npm test` (81 tests) y `npm run build`; backend con `manage.py check` y `pytest` (135 tests). No se añadió `dangerouslySetInnerHTML` al dominio de notas y el código TypeScript nuevo no usa `any` explícito.

---

## Contexto y Estado Actual Auditado

### Arquitectura vigente de TaskFlow

| Capa | Tecnología | Archivos clave | Estado relevante para la migración |
|---|---|---|---|
| **Frontend** | Next.js 14+ (App Router), TypeScript | `apps/web/src/` | Estructura feature-based consolidada: `features/`, `domain/`, `infrastructure/`, `components/` |
| **UI state** | Zustand (`uiStore.ts`) | `stores/uiStore.ts` | Solo persiste `activeListId` y `editingTaskId`; debe ampliarse |
| **Persistencia local** | Dexie/IndexedDB (Schema v3) | `infrastructure/indexeddb/` | Tablas legacy más `notes`, `folders` y `note_tags`; `IndexedDbNoteRepository` mantiene el índice de búsqueda local |
| **Sincronización** | Cola optimista local → Django REST | `infrastructure/api/`, `apps/api/apps/sync/` | Arquitectura delta-sync con `idempotencyKey`; reutilizable para notas |
| **Backend** | Django + DRF | `apps/api/apps/` | Apps legacy más `notes`; API autenticada de notas y validación compartida con el flujo de sync |
| **Dominio tarea** | `Task` con `title`, `description`, `status`, `position`, `listId` | `domain/task/models.ts`, `api/apps/tasks/models.py` | Sin estructura de bloques; no soporta checklists anidados ni encabezados |
| **Vista principal** | `NotesWorkspace` + `NoteLibrary` + `NoteEditor` | `features/notes/` | `/app` muestra el workspace de notas; la experiencia legacy permanece fuera de esta ruta |
| **Diseño** | Tokens CSS en `tokens.css`, 2 temas (dark + minimal) | `styles/tokens.css`, `app/globals.css` | Sistema de tokens maduro; paleta verde-oscuro como identidad |
| **Editor** | `NoteEditor` + `useNoteEditor` + `BlockRenderer` | `features/notes/` | Editor de columna completa con bloques, debounce local, undo y checklist; la toolbar enriquecida completa queda pendiente |

### Brechas identificadas respecto a Apple Notes (InformeNOTAS.md)

1. **Dominio:** resuelto en Fase 2 para `paragraph`, `heading`, `checklist`, `code` y `divider`; los adjuntos continúan fuera de alcance.
2. **Editor:** resuelto parcialmente; existe lienzo de notas y captura por bloques, pero falta completar autofocus fiable, edición rica por selección y toolbar contextual funcional.
3. **Dashboard:** la ruta `/app` usa `NotesWorkspace`; el dashboard legacy y sus tareas se conservan para no romper `tasks/lists`.
4. **Checklists:** resuelto en Fase 2 para estado, auto-sort, indentación 0–4, soft-return y navegación por teclado; drag-and-drop real y acciones masivas siguen pendientes.
5. **Organización:** el modelo backend `Folder` ya existe, pero el repositorio, el árbol persistente y la creación de carpetas pertenecen a Fase 3.
6. **Búsqueda:** existe `searchIndex` y `NoteRepository.search`; falta conectar resultados reales de notas a `NoteLibrary` y al sidebar.
7. **Vista galería:** existe el selector persistido `notes_view_mode`; falta renderizar tarjetas de notas reales y miniaturas desde IndexedDB.
8. **Secciones colapsables:** inexistentes; el editor no interpreta `H1/H2/H3` como delimitadores de sección.
9. **Resaltado bicolor:** el modelo y los tokens existen, y el renderizador soporta `data-highlight`; falta la aplicación interactiva desde una selección.

---

## Principios de Implementación

1. **Migración aditiva estricta.** Toda tabla, componente o modelo nuevo convive con el original. No se elimina ni altera código de producción de `tasks/lists` hasta que exista una ruta de conversión validada y documentada en un ADR.
2. **Documento estructurado por bloques.** Una nota persiste como un array JSON versionado de bloques tipados. No se almacena HTML arbitrario. El tipo `BlockNode` es la unidad atómica del editor.
3. **Seguridad ante renderizado.** Ningún bloque se inserta con `dangerouslySetInnerHTML`. El renderizador de bloques construye el DOM de forma imperativa a partir del JSON validado.
4. **Título derivado.** La primera línea no vacía del primer bloque de tipo `heading` (nivel 1) o `paragraph` determina el campo `title` materializado. No se duplica en el lienzo.
5. **Sync reutilizado.** El motor `sync_operations` existente se extiende con `entityType: "note"` y `entityType: "folder"`; no se crea una segunda cola.
6. **Local-First.** La fuente de verdad es IndexedDB; el backend es un espejo. Las operaciones se optimizan localmente y se reconcilian en diferido.

---

## Fase 1 — Rediseño de Interfaz y Limpieza de Lienzo

> **Objetivo:** Transformar la vista principal de gestor de tareas a biblioteca de notas limpia; implementar el editor fullscreen con enfoque "captura primero".

### 1.1 Auditoría y eliminación de elementos superfluos del Dashboard

**Elementos a retirar de `DashboardView.tsx`:**

| Elemento | Razón de eliminación |
|---|---|
| `<p className="eyebrow">Espacio personal / Hoy</p>` | Texto de marketing sin valor funcional |
| `<h1>Pendientes que caben en la cabeza.</h1>` | Eslogan irrelevante en una app de notas |
| `<p className="page-lede">Captura lo importante...</p>` | Texto de onboarding permanente innecesario |
| `<PendingCount>` como widget de cabecera | Métrica de tareas, no de notas |
| `<VoiceRecorder>` permanente en el cuerpo | Se reubica como acción secundaria del editor |
| `<ListSwitcher>` en barra horizontal | Sustituido por navegación lateral por carpetas |
| Botón `"Actualizar"` / `RefreshCw` | La sincronización debe ser transparente |

**Nuevo layout principal (notas):**

```
┌─────────────────────────────────────────────────────┐
│  AppShell                                            │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │  Sidebar     │  │  NoteLibrary / NoteEditor    │ │
│  │  (16rem)     │  │  (flex: 1)                   │ │
│  │              │  │                              │ │
│  │  [Búsqueda]  │  │  Vista Lista / Galería       │ │
│  │  [Carpetas]  │  │  o editor fullscreen         │ │
│  │  [Etiquetas] │  │                              │ │
│  │  [+ Nueva]   │  │                              │ │
│  └──────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 1.2 Nuevo sistema de layout — `AppShell`

**Archivo nuevo:** `apps/web/src/components/layout/AppShell.tsx`

- Shell de dos columnas: `aside` (sidebar colapsable) + `main` (NoteLibrary o NoteEditor).
- La sidebar hereda la clase CSS `.app-frame__sidebar` ya existente (sin cambios en tokens).
- En móvil (< 768 px), la sidebar se convierte en un drawer deslizable usando el componente `Drawer.tsx` ya existente.
- La columna principal ocupa `flex: 1; min-width: 0` para evitar overflow.

**Archivo modificado:** `apps/web/src/app/app/page.tsx`

- Sustituye `DashboardView` por `AppShell` como raíz de la experiencia de notas.
- `DashboardView` original se mantiene en una sub-ruta `/tasks` para acceso a las tareas legacy.

### 1.3 Sidebar de navegación — `NoteSidebar`

**Archivo nuevo:** `apps/web/src/features/notes/components/NoteSidebar.tsx`

Secciones ordenadas verticalmente:

```
[🔍 Buscar notas...]          ← SearchInput inline
─────────────────────
[📁 Todas las notas]          ← FolderNode (raíz)
[📁 Personal]
  [📁 Diario]                 ← Subcarpeta anidada (1 nivel de indentación)
[📁 Trabajo]
─────────────────────
Etiquetas
  #ideas   #proyectos          ← TagCloud (horizontal, scrollable)
─────────────────────
[+ Nueva carpeta]
```

- Cada `FolderNode` es un `<button>` con `aria-expanded` y `role="treeitem"` siguiendo el patrón WAI-ARIA Tree.
- La carpeta activa recibe `data-active="true"` para styling con selector de atributo (sin clases condicionales en JS).
- Drag-and-drop de carpetas se difiere a Fase 3.

### 1.4 Editor a pantalla completa — `NoteEditor`

**Archivo nuevo:** `apps/web/src/features/notes/components/NoteEditor.tsx`

**Principio (InformeNOTAS.md §1):** "captura primero, estructura después". Al abrir o crear una nota, el foco cae inmediatamente en el lienzo de escritura. No aparece ningún modal; el editor es la pantalla completa de la columna derecha.

```
┌─────────────────────────────────────┐
│  [← Volver]          [··· Opciones] │  ← Toolbar mínima, visible solo al hover
│                                     │
│  # Título de la nota                │  ← Autofocus aquí
│                                     │
│  Cuerpo libre...                    │
│                                     │
└─────────────────────────────────────┘
```

- **Autofocus:** `useEffect(() => titleRef.current?.focus(), [])` al montar el componente.
- **Toolbar contextual:** aparece solo cuando hay texto seleccionado (posición flotante mediante `getBoundingClientRect()`). Contiene: **N** (bold), *I* (italic), `</>` (code inline), resaltado bicolor (5 colores), conversión a checklist.
- **Sin modal:** el editor reemplaza la vista de biblioteca en la columna principal; no se abre sobre ella.
- **Guardado silencioso:** cada cambio dispara un debounce de 500 ms que persiste el bloque en IndexedDB. No hay botón "Guardar".

### 1.5 Tokens de diseño adicionales

**Archivo modificado:** `apps/web/src/styles/tokens.css`

Añadir al `:root` existente (sin alterar las variables ya definidas):

```css
/* Notas — extensión de tokens */
--color-highlight-pink:   rgba(255, 102, 153, 0.22);
--color-highlight-purple: rgba(163, 102, 255, 0.22);
--color-highlight-orange: rgba(255, 170,  80, 0.22);
--color-highlight-mint:   rgba( 80, 220, 180, 0.22);
--color-highlight-blue:   rgba( 80, 160, 255, 0.22);

--color-highlight-pink-text:   #ff6699;
--color-highlight-purple-text: #a366ff;
--color-highlight-orange-text: #ffaa50;
--color-highlight-mint-text:   #50dcb4;
--color-highlight-blue-text:   #50a0ff;

--editor-line-height: 1.7;
--editor-max-width:   68ch;
--editor-padding-x:   var(--space-6);
--editor-padding-y:   var(--space-7);
```

El tema `[data-theme="minimal"]` ya existente hereda estos tokens automáticamente porque usan `rgba` con opacidad; solo se ajusta la saturación de los colores de texto si el contraste WCAG AA no se cumple en el tema claro.

### 1.6 Vista de biblioteca — `NoteLibrary`

**Archivo nuevo:** `apps/web/src/features/notes/components/NoteLibrary.tsx`

Dos modos conmutables mediante un `SegmentedControl` (nuevo componente UI):

| Modo Lista | Modo Galería |
|---|---|
| Tarjeta horizontal por nota | Grid de 2-3 columnas |
| Título + preview de 2 líneas + fecha | Miniatura del contenido + título |
| Ordenación: fecha de modificación desc. | Igual que lista |

- La preferencia de vista se persiste en `app_state` de IndexedDB con clave `"notes_view_mode"`.
- La miniatura de galería es un render estático (`<div aria-hidden>`) del primer bloque visible de la nota; no usa `canvas` ni imágenes generadas.
- Botón "Nueva nota" en la esquina superior derecha con shortcut `⌘N` / `Ctrl+N`.

### Aceptación Fase 1

- [x] La ruta principal muestra `NotesWorkspace` con sidebar y `NoteLibrary` al arrancar.
- [x] El sidebar muestra la carpeta raíz "Todas las notas" y el campo de búsqueda.
- [~] Al hacer clic en "Nueva nota" el editor reemplaza la biblioteca; el autofocus debe conectarse de nuevo al editor estructurado.
- [x] No aparece ningún texto de marketing en la experiencia principal de notas.
- [x] La vista conmuta entre Lista y Galería y persiste la preferencia en `app_state`.
- [~] La toolbar contextual todavía no aplica formato a una selección; el comportamiento final queda pendiente.
- [x] En < 768 px la sidebar se presenta como drawer mediante `Drawer`.
- [ ] Lighthouse Accessibility ≥ 90 en la ruta principal; requiere auditoría manual/e2e.

---

## Fase 2 — Editor de Texto y Sistema Avanzado de Checklists

> **Objetivo:** Implementar el modelo de bloques, el editor de texto enriquecido y el sistema completo de checklists con indentación jerárquica y reordenamiento automático.

### 2.1 Modelo de dominio — `Note` y `BlockNode`

**Archivos nuevos en `apps/web/src/domain/note/`:**

#### `models.ts`

```typescript
export type BlockType =
  | "paragraph"
  | "heading"     // level: 1 | 2 | 3
  | "checklist"   // array de ChecklistItem
  | "code"        // bloque de código inline o multilínea
  | "divider";    // línea horizontal

export type InlineFormat = {
  bold?: true;
  italic?: true;
  code?: true;
  highlight?: "pink" | "purple" | "orange" | "mint" | "blue";
  link?: string;
};

export type InlineSpan = {
  text: string;
  format?: InlineFormat;
};

export type ChecklistItem = {
  id: string;
  spans: InlineSpan[];
  status: "pending" | "completed";
  completedAt: string | null;
  indentLevel: number;        // 0–4
  position: number;           // orden dentro del bloque checklist
  children: ChecklistItem[];  // sub-ítems anidados
};

export type BlockNode =
  | { id: string; type: "paragraph"; spans: InlineSpan[] }
  | { id: string; type: "heading"; level: 1 | 2 | 3; spans: InlineSpan[]; collapsed?: boolean }
  | { id: string; type: "checklist"; items: ChecklistItem[]; autoSort: boolean }
  | { id: string; type: "code"; language?: string; text: string }
  | { id: string; type: "divider" };

export type Note = {
  id: string;
  folderId: string | null;    // null = sin carpeta (raíz)
  title: string;              // derivado del primer heading H1 o primer párrafo
  blocks: BlockNode[];
  tags: string[];             // extraídos de #tag en el cuerpo
  pinned: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteDraft = Pick<Note, "folderId"> & { firstLine?: string };
export type NotePatch = Partial<Pick<Note, "blocks" | "folderId" | "pinned">>;
```

**Restricciones de seguridad:**
- `spans[].text` se escapa con `textContent` en el renderizador; nunca se inserta como HTML.
- `link` solo acepta URLs con protocolo `https://` o `http://`; cualquier otro esquema es rechazado en la capa de validación del repositorio.
- `indentLevel` tiene un máximo de 4; valores mayores se normalizan al persistir.
- El array `blocks` tiene un máximo de 2000 nodos; documentos mayores se paginan (Fase 4).

#### `ports.ts`

```typescript
export interface NoteRepository {
  findAll(folderId?: string | null): Promise<Note[]>;
  findById(id: string): Promise<Note | null>;
  search(query: string): Promise<Note[]>;
  create(draft: NoteDraft): Promise<Note>;
  update(id: string, patch: NotePatch): Promise<Note>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
```

### 2.2 Persistencia local — `IndexedDbNoteRepository`

**Archivo nuevo:** `apps/web/src/infrastructure/indexeddb/IndexedDbNoteRepository.ts`

**Migración de schema a v3:**

```typescript
// schema.ts — añadir SCHEMA_V3
export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  notes: "id, folderId, title, updatedAt, archivedAt, deletedAt, pinned, [folderId+updatedAt]",
  folders: "id, parentId, name, position, updatedAt, deletedAt",
  note_tags: "++, noteId, tag",
};
export const CURRENT_SCHEMA_VERSION = 3;
```

**Tipo local:**

```typescript
export type LocalNoteRecord = Note & {
  searchIndex: string;        // texto plano de todos los spans, para búsqueda
  syncClientVersion?: number;
  syncOperationId?: string | null;
};
```

**Validación al leer:** función `assertLocalNoteRecord` siguiendo el mismo patrón que `assertLocalListRecord` y `assertLocalTaskRecord` ya existentes — valida UUID, arrays, strings y la estructura recursiva de `blocks`.

**Índice de búsqueda full-text:** Al persistir una nota, se genera la cadena `searchIndex` que concatena título y texto plano de todos los spans. Se actualiza en cada escritura. La búsqueda filtra con `note.searchIndex.toLowerCase().includes(query)` sin motor externo.

### 2.3 Sincronización — extensión del motor existente

**Archivo modificado:** `apps/web/src/infrastructure/indexeddb/schema.ts`

```typescript
// Añadir a LocalEntityType
export type LocalEntityType = "list" | "task" | "note" | "folder";
```

Las operaciones de nota se encolan con `entityType: "note"` en la tabla `sync_operations` existente, con `payloadVersion: 1` y el `NotePatch` como payload. El motor de procesamiento en `apps/api/apps/sync/` se extiende con un handler `NoteOperationHandler` en el backend.

### 2.4 Renderizador de bloques — `BlockRenderer`

**Archivo nuevo:** `apps/web/src/features/notes/components/BlockRenderer.tsx`

```typescript
// Renderizador puro (sin estado): recibe BlockNode[] y callbacks de edición
// Construye el DOM usando React.createElement; NUNCA dangerouslySetInnerHTML

function renderSpan(span: InlineSpan, key: number): React.ReactNode {
  // Aplica clases CSS semánticas: .span--bold, .span--highlight-pink, etc.
  // Para links: <a href={validatedUrl} rel="noopener noreferrer">
}

function renderBlock(block: BlockNode, handlers: BlockHandlers): React.ReactNode {
  switch (block.type) {
    case "heading":   return <HeadingBlock ... />;
    case "paragraph": return <ParagraphBlock ... />;
    case "checklist": return <ChecklistBlock ... />;
    case "code":      return <CodeBlock ... />;
    case "divider":   return <hr className="note-divider" aria-hidden />;
  }
}
```

### 2.5 Sistema de checklists — `ChecklistBlock`

**Archivo nuevo:** `apps/web/src/features/notes/components/ChecklistBlock.tsx`

#### Estado del ítem

```
○ Tarea pendiente          ← círculo SVG animable
✓ Tarea completada         ← check con line-through y opacidad reducida
```

#### Algoritmo de reordenamiento automático (`autoSort: true`)

El reordenamiento es una **mutación del modelo**, no una animación de cliente aislada:

```typescript
function sortChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  const pending   = items.filter(i => i.status === "pending");
  const completed = items.filter(i => i.status === "completed");
  return [
    ...pending.map((item, idx) => ({ ...item, position: idx })),
    ...completed.map((item, idx) => ({ ...item, position: pending.length + idx })),
  ];
}
```

Secuencia de eventos al marcar un ítem:
1. Usuario clica el círculo → el ítem recibe clase CSS `checklist-item--completing`.
2. CSS aplica `transition: transform 300ms ease, opacity 300ms ease` y desliza el ítem con `translateY(8px)`.
3. `onAnimationEnd` (o `setTimeout(300)`) dispara la mutación `sortChecklistItems`.
4. El nuevo array se persiste en IndexedDB vía debounce urgente de 100 ms (no el de 500 ms habitual).
5. Se encola la operación de sync.

Si `autoSort: false` (modo manual), el ítem cambia de estado pero permanece en su posición original.

#### Indentación

```typescript
// Tab → incrementar indentLevel (máx. 4)
// Shift+Tab → decrementar indentLevel (mín. 0)
function indentItem(item: ChecklistItem, delta: 1 | -1): ChecklistItem {
  return { ...item, indentLevel: Math.max(0, Math.min(4, item.indentLevel + delta)) };
}
```

El `indentLevel` se traduce a `padding-inline-start: calc(var(--indent-level) * 1.5rem)` mediante la custom property CSS `--indent-level`.

#### Soft Return (Shift+Enter)

Al pulsar `Shift+Enter` dentro de un ítem de checklist, se inserta `\n` dentro del array `spans` del ítem actual en lugar de crear un nuevo ítem. El renderizador convierte `\n` en un `<br>` dentro del span.

#### Atajos de teclado del checklist

| Acción | Shortcut macOS | Shortcut Windows/Linux |
|---|---|---|
| Crear checklist | `⌘ Shift L` | `Ctrl Shift L` |
| Indentar ítem | `Tab` | `Tab` |
| Des-indentar | `Shift Tab` | `Shift Tab` |
| Salto suave | `Shift Enter` | `Shift Enter` |
| Marcar todo | `⌘ Shift A` | `Ctrl Shift A` |

#### Accesibilidad

- Cada ítem es un `<li role="checkbox" aria-checked={...}>` dentro de un `<ul role="group">`.
- El drag-handle recibe `aria-label="Arrastrar para reordenar"` y `tabindex="0"` con soporte de teclado (flechas ↑↓ con `Space` para soltar).
- El reordenamiento por teclado actualiza `aria-live="polite"` con `"Ítem movido a la posición N"`.

### 2.6 Gestor de estado del editor — `useNoteEditor`

**Archivo nuevo:** `apps/web/src/features/notes/application/useNoteEditor.ts`

Hook que encapsula:
- Estado local de `blocks: BlockNode[]` (copia editable, no la del store).
- `draftPatch: NotePatch` acumulado entre escrituras.
- `save()` debounced 500 ms → persiste en IndexedDB → encola sync.
- `applyBlockOp(op: BlockOperation)` para inserciones, splits, merges y conversiones de tipo.
- `handleKeyDown(event, blockId, itemId?)` para enrutar atajos globales.
- `undoStack` de hasta 50 operaciones (implementación simple con array de snapshots parciales).

### 2.7 Backend Django — modelo `Note`

**Archivo nuevo:** `apps/api/apps/notes/models.py`

```python
class Note(OwnedTimestampedModel):
    folder = models.ForeignKey(
        "notes.Folder", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="notes"
    )
    title = models.CharField(max_length=500, blank=True)
    blocks = models.JSONField(default=list)   # Array de BlockNode validado
    tags = models.JSONField(default=list)
    pinned = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    sync_client_version = models.PositiveBigIntegerField(null=True, blank=True)
    sync_operation_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [
            models.Index(fields=("external_user_id", "folder", "updated_at")),
            models.Index(fields=("external_user_id", "deleted_at")),
        ]

    def clean(self):
        super().clean()
        validate_blocks(self.blocks)   # Validador recursivo de BlockNode[]
```

**Validador `validate_blocks`:** función pura en `apps/notes/validators.py` que verifica la estructura de cada bloque sin ejecutar contenido. Rechaza cualquier campo fuera del schema y strings con patrones de inyección. El serializer `NoteSerializer` lo invoca en `validate()`.

### Aceptación Fase 2

- [~] Se puede crear una nota con `paragraph`, `heading` H1 y `checklist`; H2/H3 existen en el modelo/renderizador, pero falta exponer su conversión en la UI.
- [x] Hacer clic en el círculo marca el ítem como completado con animación de 300 ms.
- [x] Con `autoSort: true`, el ítem completado se desplaza al fondo del bloque y se persiste.
- [x] `Tab` y `Shift+Tab` modifican el `indentLevel` con límites 0–4.
- [x] `Shift+Enter` inserta un salto de línea suave dentro del ítem activo.
- [x] La nota se guarda automáticamente sin botón mediante debounce de 500 ms.
- [x] El undo (`⌘Z`/`Ctrl+Z`) mantiene hasta 50 snapshots en memoria.
- [x] Ningún bloque de notas se renderiza con `dangerouslySetInnerHTML`.
- [x] `validate_blocks` rechaza payloads malformados; la API devuelve HTTP 400 en el contrato de entrada.
- [x] Tests unitarios cubren `sortChecklistItems`, `indentItem`, soft-return, `validate_blocks`, migración Dexie y repositorio local.

### Cierre técnico y entrada a Fase 3

La base técnica de Fase 2 está lista para continuar con organización y búsqueda. Fase 3 debe consumir `NoteRepository` y `LocalReplica` existentes, sin crear una segunda cola de sync ni modificar el dominio legacy.

Antes de cerrar Fase 3 deberán completarse estas tareas heredadas:

- Conectar `NoteLibrary` al repositorio local para listar, ordenar y mostrar notas reales.
- Crear `IndexedDbFolderRepository`, persistir `Folder` y construir el árbol anidado con profundidad máxima 5.
- Sustituir las carpetas de ejemplo del sidebar por datos locales y conectar creación/movimiento.
- Extraer y persistir `#tags` en `Note.tags` y `note_tags`, incluyendo `getAllTags()`.
- Implementar búsqueda local visible, resaltado de coincidencias y filtro por carpeta/etiqueta.
- Implementar enlaces `note://`, autocompletado `>>` y backlinks.
- Añadir pruebas de integración para la réplica de `note` y `folder`, incluyendo conflictos y tombstones.
- Resolver el autofocus del editor, la edición H2/H3 y la toolbar de formato antes de declarar completo el editor enriquecido.

---

## Fase 3 — Arquitectura de Organización y Estructuración de Contenido

> **Objetivo:** Implementar carpetas anidadas, etiquetado dinámico por `#tag`, enlace rápido entre notas con `>>`, y las vistas conmutables Lista/Galería.

### 3.1 Dominio de carpetas — `Folder`

**Archivo nuevo:** `apps/web/src/domain/folder/models.ts`

```typescript
export type Folder = {
  id: string;
  parentId: string | null;   // null = raíz
  name: string;
  emoji: string;
  position: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FolderDraft = Pick<Folder, "name" | "parentId" | "emoji">;
export type FolderPatch = Partial<Pick<Folder, "name" | "emoji" | "parentId" | "position">>;
```

**Backend:** `apps/api/apps/notes/models.py` — modelo `Folder` con `parent = ForeignKey("self", null=True)`. El repositorio de backend valida que la profundidad no supere 5 niveles para prevenir recursión costosa en queries.

### 3.2 Árbol de carpetas en el sidebar

**Modificación:** `apps/web/src/features/notes/components/NoteSidebar.tsx`

El árbol se construye a partir de una lista plana de `Folder[]` en O(n) con un `Map`:

```typescript
function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const map = new Map<string | null, FolderTreeNode[]>();
  for (const folder of folders) {
    if (!map.has(folder.parentId)) map.set(folder.parentId, []);
    map.get(folder.parentId)!.push({ ...folder, children: [] });
  }
  function attach(parentId: string | null): FolderTreeNode[] {
    return (map.get(parentId) ?? [])
      .sort((a, b) => a.position - b.position)
      .map(node => ({ ...node, children: attach(node.id) }));
  }
  return attach(null);
}
```

Drag-and-drop de carpetas implementado con la API nativa `draggable` + eventos `dragover` / `drop`. No se añade ninguna librería de DnD externa.

### 3.3 Sistema de etiquetas (`#tag`)

**Extractor de etiquetas:** función pura `extractTags(blocks: BlockNode[]): string[]` que recorre los spans buscando el patrón `/(?<![^\s#])#([\w\u00C0-\u024F]+)/g`. El resultado reemplaza `Note.tags` al persistir.

**Autocompletado en el editor:**
- Al escribir `#` seguido de al menos un carácter alfanumérico, aparece un `<Popover>` flotante con las últimas etiquetas usadas ordenadas por frecuencia.
- El popover se descarta con `Escape` o al continuar escribiendo caracteres no alfanuméricos.
- La lista de etiquetas se obtiene de `IndexedDbNoteRepository.getAllTags()` — sin endpoint de red.

**Panel de etiquetas en el sidebar:**
- Sección colapsable debajo del árbol de carpetas.
- Al clicar una etiqueta, `NoteLibrary` filtra las notas cuyo `tags` incluye la etiqueta seleccionada.
- Las etiquetas se muestran como chips con el color de acento del tema actual.

### 3.4 Enlace rápido entre notas (`>>`)

Al escribir `>>` en cualquier bloque `paragraph` o `heading`, se despliega un `<Popover>` de autocompletado:

```
>> d|
┌─────────────────────────────────┐
│ 🔍 Buscando notas...            │
│ ─────────────────────────────── │
│ 📄 Diario 2026-09-20            │
│ 📄 Diseño de sistema de notas   │
│ [+ Crear nota nueva]            │
└─────────────────────────────────┘
```

- La búsqueda es local (IndexedDB `searchIndex`) con debounce de 150 ms.
- Al seleccionar una nota, la secuencia `>>texto` se convierte en un `InlineSpan` con `format.link = "note://[noteId]"`.
- El renderizador convierte `note://[noteId]` en un `<button>` que abre la nota en el panel principal (no en una nueva pestaña).
- Si la nota de destino es renombrada, el título del enlace se actualiza al siguiente render porque el componente lo resuelve desde el store en tiempo de renderizado, no desde el texto guardado.

**Backlinks:** en el panel de detalle de la nota, una sección "Notas que enlazan aquí" lista las notas que contienen `"note://[noteId]"` en su índice de búsqueda. Se calcula con una query IndexedDB al abrir la nota.

### 3.5 Vista Lista y Vista Galería — implementación definitiva

**Archivo modificado:** `apps/web/src/features/notes/components/NoteLibrary.tsx`

#### Vista Lista

```css
.note-library--list .note-card {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 150ms ease;
}
.note-library--list .note-card:hover {
  background: var(--color-surface-raised);
}
```

#### Vista Galería

```css
.note-library--gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-4);
  padding: var(--space-5);
}
.note-gallery-card {
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  overflow: hidden;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.note-gallery-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-panel);
}
```

La miniatura es un render estático de los primeros 3 bloques (`pointer-events: none; user-select: none`) con `font-size: 0.55rem` para simular la densidad del contenido real.

#### Control de alternancia

Nuevo componente `apps/web/src/components/ui/SegmentedControl.tsx` con opciones `{ value: "list" | "gallery", label, icon }`.

### 3.6 Búsqueda local

```typescript
// IndexedDbNoteRepository.ts
async search(query: string): Promise<Note[]> {
  if (!query.trim()) return this.findAll();
  const normalized = query.toLowerCase();
  const allNotes = await this.db.notes
    .where("deletedAt").equals(null)
    .toArray();
  return allNotes
    .filter(note => note.searchIndex?.toLowerCase().includes(normalized))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
```

**Latencia objetivo:** < 50 ms para colecciones de hasta 5000 notas. Los términos de búsqueda se resaltan en la preview de la tarjeta usando `<mark>`.

### Aceptación Fase 3

- [x] Se pueden crear carpetas y subcarpetas (hasta 5 niveles) desde el sidebar.
- [~] Una nota se puede mover entre carpetas mediante drag-and-drop o desde el menú contextual; el repositorio soporta `folderId`, pero falta la interacción de movimiento.
- [x] Al escribir `#etiqueta` en el cuerpo, la etiqueta aparece en el panel lateral sin recargar.
- [x] Al clicar una etiqueta en el sidebar, la biblioteca filtra las notas correctamente.
- [ ] Al escribir `>>` se despliega el autocompletado y al seleccionar una nota se inserta el enlace.
- [ ] El enlace `>>` abre la nota correcta al clicar.
- [ ] La sección "Notas que enlazan aquí" se muestra correctamente al abrir una nota enlazada.
- [~] La búsqueda local consulta el índice materializado; falta el benchmark formal de < 100 ms con 1000 notas.
- [x] Las vistas Lista y Galería muestran el estado actualizado de las notas en tiempo real.

---

## Fase 4 — Optimizaciones y Utilidades Esenciales

> **Objetivo:** Secciones colapsables por encabezado, resaltado bicolor de texto, búsqueda de alta velocidad indexada y optimizaciones de rendimiento.

### 4.1 Secciones colapsables por encabezado

**Principio (InformeNOTAS.md §3):** al formatear texto como `H1`, `H2` o `H3`, el sistema delimita implícitamente una sección que se extiende hasta el siguiente encabezado del mismo nivel o superior.

El campo `collapsed?: boolean` ya está en el tipo `BlockNode` de tipo `heading` (definido en Fase 2).

**Algoritmo de alcance de sección:**

```typescript
function getSectionRange(blocks: BlockNode[], headingIndex: number): [number, number] {
  const heading = blocks[headingIndex] as HeadingBlock;
  let end = headingIndex + 1;
  while (end < blocks.length) {
    const next = blocks[end];
    if (next.type === "heading" && next.level <= heading.level) break;
    end++;
  }
  return [headingIndex + 1, end - 1]; // índices inclusivos del contenido colapsable
}
```

**Icono de colapso:** aparece en el margen izquierdo al hover del encabezado. Usa `▶` (colapsado) / `▼` (expandido) con `transform: rotate(90deg)` y `transition: transform 200ms ease`.

**Atajos de teclado:**

| Acción | Shortcut |
|---|---|
| Colapsar/expandir sección actual | `⌘ Click` en el encabezado |
| Colapsar todos los H1 | `⌘ ⌥ 1` |
| Colapsar todos los H2 | `⌘ ⌥ 2` |
| Expandir todo | `⌘ ⌥ 0` |

**Persistencia:** el estado `collapsed` se guarda en el array `blocks` de la nota. No es una preferencia de interfaz; es parte del documento.

### 4.2 Resaltado de texto bicolor

**Implementación del motor bicolor (InformeNOTAS.md §3):**

El resaltado aplica simultáneamente:
1. `background-color`: color del token `--color-highlight-*` (opacidad reducida, 22%).
2. `color`: color del token `--color-highlight-*-text` (saturado, para contraste AA).

```css
[data-highlight="pink"] {
  background-color: var(--color-highlight-pink);
  color: var(--color-highlight-pink-text);
  border-radius: 2px;
  padding: 0 2px;
}
/* Ídem para purple, orange, mint, blue */
```

El renderizador de spans aplica el atributo `data-highlight` en lugar de estilos inline, garantizando que el tema `[data-theme="minimal"]` pueda sobrescribir los colores sin mayor especificidad.

**Toolbar de resaltado:** la toolbar contextual flotante incluye 5 círculos de color. Al clicar uno, se obtiene la selección actual con `window.getSelection()`, se identifican los spans afectados en el modelo de bloques y se crean o fusionan `InlineSpan`s con `format.highlight` del color elegido. Si el span ya tiene ese color, se elimina (toggle).

### 4.3 Búsqueda local de alta velocidad

**Tokenización básica para búsqueda por prefijo:**

```typescript
function buildSearchIndex(note: Note): string {
  const title = note.title.toLowerCase();
  const body  = note.blocks.flatMap(extractTextFromBlock).join(" ").toLowerCase();
  const tags  = note.tags.join(" ");
  return `${title} ${body} ${tags}`;
}
```

**Ordenación de resultados por relevancia:**

```typescript
function scoreNote(note: LocalNoteRecord, query: string): number {
  const q = query.toLowerCase();
  let score = 0;
  if (note.title.toLowerCase().startsWith(q)) score += 10;
  if (note.title.toLowerCase().includes(q))   score += 5;
  const freq = (note.searchIndex.match(new RegExp(q, "g")) ?? []).length;
  score += Math.min(freq, 5);
  return score;
}
```

**Shortcut global de búsqueda:** `⌘K` / `Ctrl+K` focaliza el campo de búsqueda del sidebar.

### 4.4 Paginación virtual para notas largas

Para notas que superen 200 bloques, `NoteEditor` activa un renderizador de ventana virtual:

- Solo se renderizan los bloques en el viewport ± 20 bloques de margen.
- Implementación con `IntersectionObserver` sin librerías externas.
- El bloque activo siempre se mantiene montado para no perder el cursor durante el scroll virtual.

### 4.5 Conversión de tareas existentes a notas (migración voluntaria)

**Archivo nuevo:** `apps/web/src/features/notes/application/convertTasksToNote.ts`

```typescript
async function convertListToNote(
  list: TaskList,
  tasks: Task[],
  noteRepo: NoteRepository,
): Promise<Note> {
  const blocks: BlockNode[] = [
    { id: uuid(), type: "heading", level: 1, spans: [{ text: list.name }] },
    {
      id: uuid(),
      type: "checklist",
      autoSort: false,
      items: tasks
        .sort((a, b) => a.position - b.position)
        .map(task => ({
          id: task.id,
          spans: [{ text: task.title }],
          status: task.status,
          completedAt: task.completedAt,
          indentLevel: 0,
          position: task.position,
          children: [],
        })),
    },
  ];
  return noteRepo.create({ folderId: null, blocks });
}
```

La conversión se expone como una acción de menú contextual en cada lista del sidebar legacy. Incluye vista previa antes de confirmar. La lista original permanece intacta (migración no destructiva).

### 4.6 Optimizaciones de rendimiento

| Optimización | Técnica | Archivo afectado |
|---|---|---|
| Debounce de guardado | 500 ms en `useNoteEditor` | `application/useNoteEditor.ts` |
| Memo de renderizador | `React.memo` + comparación por `block.id` | `BlockRenderer.tsx` |
| Carga diferida de la biblioteca | `next/dynamic` con `ssr: false` | `app/app/page.tsx` |
| Prefetch de nota al hover | `NoteRepository.findById` en `onMouseEnter` | `NoteLibrary.tsx` |
| Índice de búsqueda en memoria | Cache invalidado en cada escritura | `IndexedDbNoteRepository.ts` |
| Animaciones con CSS | Preferir `transform` y `opacity`; nunca `top/left` animados | `globals.css` |

### Aceptación Fase 4

- [~] Clicar el margen izquierdo de un `H1` colapsa su contenido con animación suave; el control y el estado están implementados, pero falta una prueba e2e de la animación.
- [x] `⌘ ⌥ 1` colapsa todos los bloques H1 de la nota activa.
- [~] El estado `collapsed` se incluye en el guardado local; falta una prueba e2e de cerrar y reabrir el editor.
- [~] Seleccionar texto y elegir un color de resaltado actualiza el modelo y los tokens CSS; falta pintar spans parciales dentro de los campos editables.
- [x] Clicar el mismo color de resaltado sobre texto ya resaltado lo elimina (toggle), cubierto por test unitario.
- [x] La búsqueda ordena los resultados por relevancia (título > cuerpo > etiqueta), cubierta por test de repositorio.
- [x] `⌘K` focaliza el campo de búsqueda desde cualquier parte de la app.
- [~] Se añadió `content-visibility` para notas largas; la ventana virtual con `IntersectionObserver` y el benchmark de 2000 bloques quedan pendientes.
- [ ] La conversión de lista de tareas a nota no forma parte de esta implementación y queda pendiente.

### Estado de ejecución Fase 4 al 2026-09-22

Implementados `sections.ts` y `formatting.ts` con pruebas unitarias, el toggle de secciones y sus atajos en el editor, la toolbar de resaltado bicolor, el scoring de búsqueda local y el atajo global `⌘K`/`Ctrl+K`. Se validó el frontend con typecheck, lint, 89 tests y build de producción. La validación backend queda pendiente en este entorno porque falta la dependencia `celery`.

---

## Fase 5 — Revisión personal, reconstrucción y cierre de producción

> **Objetivo:** revisar el proyecto completo, completar las brechas funcionales y operativas, reconstruirlo desde un checkout limpio y dejarlo listo para uso real con evidencia reproducible. Esta fase es transversal: no se considera terminada por tener código, sino por superar los gates de producto, seguridad, datos, despliegue y operación.

El informe operativo completo está en [`docs/InformeFase5Produccion.md`](InformeFase5Produccion.md).

### 5.1 Inventario y reconciliación

- [ ] Reconciliar `RoadmapAppleNotas.md`, `CURRENT_STATE.md` y `ROADMAP.md` para eliminar estados contradictorios.
- [ ] Revisar todos los `[ ]` y `[~]` de fases anteriores.
- [ ] Clasificar cada pendiente como implementación, validación, bloqueo externo o fuera de alcance.
- [ ] Crear una matriz final requisito → archivo → prueba → evidencia.

### 5.2 Cierre funcional del dominio de notas

- [ ] Sustituir los campos de texto simples por una edición que pueda mostrar spans, enlaces, saltos y resaltados parciales de forma segura.
- [ ] Completar enlaces `>>`, destinos `note://`, backlinks y actualización de títulos enlazados.
- [ ] Completar movimiento de notas entre carpetas, conflictos y tombstones.
- [ ] Implementar virtualización o ventana estable para notas largas y medir 2.000 bloques.
- [ ] Implementar conversión no destructiva de listas legacy a notas.
- [ ] Añadir pruebas e2e desktop/mobile de creación, edición, búsqueda, colapso, resaltado, reapertura, movimiento y sync.
- [ ] Completar auditoría manual de accesibilidad y reduced motion.

### 5.3 Recreación reproducible

La reconstrucción debe partir de un checkout limpio, sin reutilizar `node_modules`, `.next`, volúmenes ni bases de datos previas:

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

Los checks frontend y backend deben ejecutarse con las dependencias fijadas, preferiblemente dentro del servicio Docker `api` para garantizar que `celery` y Django estén instalados:

```bash
cd apps/web && npm ci && npm run lint && npm run typecheck && npm test && npm run build
cd apps/api && python3 -m pytest && python3 manage.py check
```

La recreación debe demostrar que las migraciones de IndexedDB son no destructivas y que las tablas legacy `tasks/lists` sobreviven.

### 5.4 Staging y publicación

- [ ] Crear staging aislado con Compose, base de datos, Redis, secretos y dominio propios.
- [ ] Provisionar `taskflow` en Accounts y una cuenta demo específica de QA.
- [ ] Ejecutar login/logout real sobre HTTPS, expiración, CSRF, cookies y creación de tarea/nota.
- [ ] Probar sync, conflictos, tombstones, offline y recuperación.
- [ ] Ejecutar Playwright desktop/mobile, Lighthouse y revisión de lector de pantalla.
- [ ] Publicar imágenes con tag inmutable y ejecutar el workflow de release.
- [ ] Conectar Prometheus/Alertmanager, disparar una alerta controlada y verificar su resolución.
- [ ] Ejecutar backup/restore y rollback contra una release anterior real.
- [ ] Registrar commit, migraciones, evidencias, riesgos y responsable de aprobación.

### Aceptación Fase 5

- [ ] El proyecto se reconstruye desde cero siguiendo el informe operativo sin pasos implícitos.
- [ ] Frontend: lint, typecheck, tests, build y e2e desktop/mobile en verde.
- [ ] Backend: dependencias instaladas, pytest, Django checks, migraciones y contrato API en verde.
- [ ] Notas: editor enriquecido, enlaces, backlinks, carpetas, virtualización y conversión validados.
- [ ] Seguridad: sin secretos en Git/logs, auth/CSRF/cookies/headers/input review completada.
- [ ] Datos: migración IndexedDB, backup/restore y tombstones verificados.
- [ ] Operación: health/readiness, logs, métricas y alertas verificadas.
- [ ] Despliegue: staging HTTPS, smoke real de Accounts y rollback ejecutados.
- [ ] Documentación: estado global, runbooks y evidencias fechadas y enlazadas.

### Estado inicial Fase 5 al 2026-09-22

`[~]` La infraestructura de producción está preparada y el frontend tiene gates verdes recientes, pero la fase aún está abierta por las brechas funcionales de notas y por la falta de evidencia externa de Accounts HTTPS, rollback, alertas conectadas y accesibilidad manual. El detalle y el orden de ejecución están en `docs/InformeFase5Produccion.md`.

---

## Arquitectura de archivos — resumen de cambios

```
apps/web/src/
├── domain/
│   ├── note/
│   │   ├── models.ts         [NUEVO] BlockNode, Note, ChecklistItem, InlineSpan
│   │   └── ports.ts          [NUEVO] NoteRepository interface
│   └── folder/
│       ├── models.ts         [NUEVO] Folder, FolderDraft, FolderPatch
│       └── ports.ts          [NUEVO] FolderRepository interface
├── features/
│   └── notes/                [NUEVO feature module]
│       ├── application/
│       │   ├── useNoteEditor.ts           [NUEVO]
│       │   ├── NoteWorkspaceProvider.tsx  [NUEVO]
│       │   └── convertTasksToNote.ts      [NUEVO]
│       └── components/
│           ├── NoteEditor.tsx             [NUEVO]
│           ├── NoteLibrary.tsx            [NUEVO]
│           ├── NoteSidebar.tsx            [NUEVO]
│           ├── BlockRenderer.tsx          [NUEVO]
│           ├── ChecklistBlock.tsx         [NUEVO]
│           ├── HeadingBlock.tsx           [NUEVO]
│           └── NoteCard.tsx               [NUEVO]
├── infrastructure/
│   └── indexeddb/
│       ├── schema.ts                      [MODIFICAR] → v3 con notes, folders, note_tags
│       ├── IndexedDbNoteRepository.ts     [NUEVO]
│       └── IndexedDbFolderRepository.ts   [NUEVO]
├── components/
│   ├── layout/
│   │   └── AppShell.tsx                  [NUEVO]
│   └── ui/
│       └── SegmentedControl.tsx          [NUEVO]
└── styles/
    └── tokens.css                        [MODIFICAR] → tokens de highlight y editor

apps/api/apps/
└── notes/                                [NUEVO Django app]
    ├── __init__.py
    ├── models.py          (Note, Folder)
    ├── serializers.py
    ├── validators.py      (validate_blocks)
    ├── api.py
    ├── services/
    └── migrations/
```

---

## Criterios de No Regresión Globales

> Deben cumplirse al final de **cada fase** antes de hacer merge a `main`.

| Criterio | Comando de verificación |
|---|---|
| Tests de dominio pasan | `cd apps/web && npx vitest run` |
| Tests de API pasan | `cd apps/api && python -m pytest` |
| Sin `dangerouslySetInnerHTML` nuevo | `grep -r "dangerouslySetInnerHTML" apps/web/src/features/notes/` → vacío |
| Sin secrets en fixtures o logs | Revisión manual de HAR y fixtures de test |
| Datos de `tasks` y `lists` intactos | `python manage.py check` + migración reversible |
| Build de producción sin errores | `cd apps/web && next build` |
| Lighthouse Performance ≥ 85 | Audit en Chrome DevTools en ruta `/app` |
| Schema IndexedDB migra sin pérdida | Test de migración en `database.test.ts` con fixture v2 |

---

## Decisiones de Arquitectura Diferidas (ADR pendientes)

Las siguientes funcionalidades están documentadas pero **excluidas** del alcance de este roadmap. Requieren un ADR separado antes de implementarse:

| Funcionalidad | Razón del diferimiento |
|---|---|
| Colaboración en tiempo real | Requiere WebSockets + CRDT; impacto alto en backend |
| Notas Matemáticas (evaluador `=`) | Dependencia de motor de cálculo externo; superficie de ataque amplia |
| Grabación de audio como adjunto permanente | `VoiceSession` actual es temporal; necesita modelo de archivos adjuntos |
| Smart Folders (carpetas dinámicas por reglas) | Requiere motor de consultas evaluable; se pospone a evaluar uso de checklists |
| Exportación masiva (Markdown / JSON) | Prioritaria, pero no bloquea el núcleo del editor |
| Cifrado de notas individuales | Requiere Web Crypto API + gestión de claves; ADR de seguridad propio |
| Grafo de conocimiento visual | Depende de que los backlinks (Fase 3) estén estabilizados |
| Vista Kanban desde checklist | Depende de la estabilidad del modelo de `ChecklistItem` |

---

*Este documento es un plan de implementación técnico, no instrucciones de ejecución directa. Cada fase debe revisarse con el equipo antes de comenzar. Los fragmentos de código son orientativos; la implementación definitiva puede variar según los tests de integración y la revisión de seguridad de cada PR.*