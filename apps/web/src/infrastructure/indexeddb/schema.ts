import type { HistoryEntry } from "@/domain/history/models";
import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import type { BlockNode, ChecklistItem, InlineSpan, Note } from "@/domain/note/models";
import { LocalStorageValidationError } from "./errors";

export const DATABASE_NAME = "taskflow-local";
export const CURRENT_SCHEMA_VERSION = 3;

export const APP_STATE_KEYS = {
  deviceId: "device_id",
  schemaVersion: "schema_version",
  clientVersion: "client_version",
  syncCursor: "sync_cursor",
  notesViewMode: "notes_view_mode",
  noteDraft: "note_draft",
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type LocalListRecord = TaskList & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncClientVersion?: number;
  syncOperationId?: string | null;
};

export type LocalTaskRecord = Task & {
  deletedAt: string | null;
  syncClientVersion?: number;
  syncOperationId?: string | null;
};

export type LocalNoteRecord = Note & {
  searchIndex: string;
  syncClientVersion?: number;
  syncOperationId?: string | null;
};

export type LocalFolderRecord = {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  updatedAt: string;
  deletedAt: string | null;
};

export type LocalNoteTagRecord = {
  noteId: string;
  tag: string;
};

export type LocalTaskEventRecord = HistoryEntry;

export type LocalEntityType = "list" | "task" | "note" | "folder";
export type LocalSyncOperationType = "create" | "update" | "delete";

export type LocalSyncOperationRecord = {
  id: string;
  deviceId: string;
  entityType: LocalEntityType;
  entityId: string;
  operation: LocalSyncOperationType;
  clientVersion: number;
  occurredAt: string;
  processedAt: string | null;
  idempotencyKey: string;
  payloadVersion: number;
  payload: JsonObject;
};

export type LocalAppStateRecord = {
  key: string;
  value: JsonValue;
};

export type LocalVoiceSessionStatus = "recording" | "uploaded" | "transcribing" | "transcribed" | "failed";

export type LocalVoiceSessionRecord = {
  id: string;
  status: LocalVoiceSessionStatus;
  transcriptRetention: boolean;
  providerMetadata: JsonObject;
  errorCode: string;
  createdAt: string;
  updatedAt: string;
};

export const SCHEMA_V1 = {
  lists: "id, position, updatedAt",
  tasks: "id, listId, status, updatedAt",
  task_events: "id, taskId, createdAt",
  app_state: "key",
} as const;

export const SCHEMA_V2 = {
  lists: "id, position, updatedAt, isArchived, [isSystem+position]",
  tasks: "id, listId, status, position, updatedAt, [listId+status]",
  task_events: "id, taskId, eventType, createdAt, [taskId+createdAt]",
  sync_operations: "id, &idempotencyKey, entityType, entityId, occurredAt, processedAt, [entityType+entityId]",
  app_state: "key",
  voice_sessions: "id, status, updatedAt",
} as const;

export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  notes: "id, folderId, title, updatedAt, archivedAt, deletedAt, pinned, [folderId+updatedAt]",
  folders: "id, parentId, name, position, updatedAt, deletedAt",
  note_tags: "++, noteId, tag",
} as const;

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

export function assertJsonObject(value: unknown, context: string): asserts value is JsonObject {
  if (!isJsonObject(value)) {
    throw new LocalStorageValidationError(`${context} debe ser un objeto JSON válido.`);
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function assertUuid(value: unknown, context: string): asserts value is string {
  if (!isUuid(value)) {
    throw new LocalStorageValidationError(`${context} debe ser un UUID válido.`);
  }
}

export function assertSyncPayload(value: unknown): asserts value is JsonObject {
  assertJsonObject(value, "El payload de sincronización");
}

export function assertLocalListRecord(value: unknown): asserts value is LocalListRecord {
  if (!isObject(value)
    || !isUuid(value.id)
    || typeof value.name !== "string"
    || typeof value.description !== "string"
    || typeof value.emoji !== "string"
    || typeof value.color !== "string"
    || !isNonNegativeInteger(value.position)
    || typeof value.isArchived !== "boolean"
    || typeof value.isSystem !== "boolean"
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || (value.deletedAt !== null && typeof value.deletedAt !== "string")
    || (value.syncClientVersion !== undefined && !isNonNegativeInteger(value.syncClientVersion))
    || (value.syncOperationId !== undefined && value.syncOperationId !== null && !isUuid(value.syncOperationId))) {
    throw new LocalStorageValidationError("El registro local de lista no es válido.");
  }
}

export function assertLocalTaskRecord(value: unknown): asserts value is LocalTaskRecord {
  if (!isObject(value)
    || !isUuid(value.id)
    || !isUuid(value.listId)
    || typeof value.title !== "string"
    || typeof value.description !== "string"
    || !isTaskStatus(value.status)
    || !isTaskSource(value.source)
    || !isNonNegativeInteger(value.position)
    || (value.completedAt !== null && typeof value.completedAt !== "string")
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || (value.deletedAt !== null && typeof value.deletedAt !== "string")
    || (value.syncClientVersion !== undefined && !isNonNegativeInteger(value.syncClientVersion))
    || (value.syncOperationId !== undefined && value.syncOperationId !== null && !isUuid(value.syncOperationId))) {
    throw new LocalStorageValidationError("El registro local de tarea no es válido.");
  }
}

export function assertLocalNoteRecord(value: unknown): asserts value is LocalNoteRecord {
  if (!isObject(value)
    || !isUuid(value.id)
    || (value.folderId !== null && !isUuid(value.folderId))
    || typeof value.title !== "string"
    || !Array.isArray(value.blocks)
    || value.blocks.length > 2000
    || !value.blocks.every(isBlockNode)
    || !Array.isArray(value.tags)
    || !value.tags.every((tag) => typeof tag === "string")
    || typeof value.pinned !== "boolean"
    || (value.archivedAt !== null && typeof value.archivedAt !== "string")
    || (value.deletedAt !== null && typeof value.deletedAt !== "string")
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || typeof value.searchIndex !== "string"
    || (value.syncClientVersion !== undefined && !isNonNegativeInteger(value.syncClientVersion))
    || (value.syncOperationId !== undefined && value.syncOperationId !== null && !isUuid(value.syncOperationId))) {
    throw new LocalStorageValidationError("El registro local de nota no es válido.");
  }
}

export function assertLocalTaskEventRecord(value: unknown): asserts value is LocalTaskEventRecord {
  if (!isObject(value)
    || !isUuid(value.id)
    || (value.taskId !== null && !isUuid(value.taskId))
    || typeof value.eventType !== "string"
    || !isJsonObject(value.payload)
    || typeof value.createdAt !== "string") {
    throw new LocalStorageValidationError("El registro local de historial no es válido.");
  }
}

export function assertLocalSyncOperationRecord(value: unknown): asserts value is LocalSyncOperationRecord {
  if (!isObject(value)
    || !isUuid(value.id)
    || !isUuid(value.deviceId)
    || !isLocalEntityType(value.entityType)
    || !isUuid(value.entityId)
    || !isSyncOperationType(value.operation)
    || !isNonNegativeInteger(value.clientVersion)
    || typeof value.occurredAt !== "string"
    || (value.processedAt !== null && typeof value.processedAt !== "string")
    || !isUuid(value.idempotencyKey)
    || !isNonNegativeInteger(value.payloadVersion)
    || !isJsonObject(value.payload)) {
    throw new LocalStorageValidationError("El registro local de sincronización no es válido.");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTaskStatus(value: unknown): value is Task["status"] {
  return value === "pending" || value === "completed";
}

function isTaskSource(value: unknown): value is Task["source"] {
  return value === "manual" || value === "voice" || value === "ai" || value === "import";
}

function isLocalEntityType(value: unknown): value is LocalEntityType {
  return value === "list" || value === "task" || value === "note" || value === "folder";
}

function isSyncOperationType(value: unknown): value is LocalSyncOperationType {
  return value === "create" || value === "update" || value === "delete";
}

function isBlockNode(value: unknown): value is BlockNode {
  if (!isObject(value) || !isUuid(value.id) || typeof value.type !== "string") return false;
  if (value.type === "paragraph") return isInlineSpanArray(value.spans);
  if (value.type === "heading") {
    return (value.level === 1 || value.level === 2 || value.level === 3)
      && isInlineSpanArray(value.spans)
      && (value.collapsed === undefined || typeof value.collapsed === "boolean");
  }
  if (value.type === "checklist") {
    return typeof value.autoSort === "boolean"
      && Array.isArray(value.items)
      && value.items.every(isChecklistItem);
  }
  if (value.type === "code") {
    return typeof value.text === "string"
      && (value.language === undefined || typeof value.language === "string");
  }
  return value.type === "divider";
}

function isInlineSpanArray(value: unknown): value is InlineSpan[] {
  return Array.isArray(value) && value.every((span) => isObject(span)
    && typeof span.text === "string"
    && (span.format === undefined || isInlineFormat(span.format)));
}

function isInlineFormat(value: unknown): boolean {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => ["bold", "italic", "code", "highlight", "link"].includes(key))
    && (value.bold === undefined || value.bold === true)
    && (value.italic === undefined || value.italic === true)
    && (value.code === undefined || value.code === true)
    && (value.highlight === undefined || ["pink", "purple", "orange", "mint", "blue"].includes(String(value.highlight)))
    && (value.link === undefined || (typeof value.link === "string" && /^https?:\/\//.test(value.link)));
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  return isObject(value)
    && isUuid(value.id)
    && isInlineSpanArray(value.spans)
    && (value.status === "pending" || value.status === "completed")
    && (value.completedAt === null || typeof value.completedAt === "string")
    && isNonNegativeInteger(value.indentLevel)
    && value.indentLevel <= 4
    && isNonNegativeInteger(value.position)
    && Array.isArray(value.children)
    && value.children.every(isChecklistItem);
}