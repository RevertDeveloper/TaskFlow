import type { HistoryEntry } from "@/domain/history/models";
import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { LocalStorageValidationError } from "./errors";

export const DATABASE_NAME = "taskflow-local";
export const CURRENT_SCHEMA_VERSION = 2;

export const APP_STATE_KEYS = {
  deviceId: "device_id",
  schemaVersion: "schema_version",
  clientVersion: "client_version",
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type LocalListRecord = TaskList & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type LocalTaskRecord = Task & {
  deletedAt: string | null;
};

export type LocalTaskEventRecord = HistoryEntry;

export type LocalEntityType = "list" | "task";
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
    || (value.deletedAt !== null && typeof value.deletedAt !== "string")) {
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
    || (value.deletedAt !== null && typeof value.deletedAt !== "string")) {
    throw new LocalStorageValidationError("El registro local de tarea no es válido.");
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
  return value === "list" || value === "task";
}

function isSyncOperationType(value: unknown): value is LocalSyncOperationType {
  return value === "create" || value === "update" || value === "delete";
}