import type { HistoryEntry } from "@/domain/history/models";
import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import { LocalStorageValidationError } from "@/infrastructure/indexeddb/errors";

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type SnapshotList = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  position: number;
  is_archived: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SnapshotTask = {
  id: string;
  list_id: string;
  title: string;
  description: string;
  status: Task["status"];
  source: Task["source"];
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SnapshotEvent = {
  id: string;
  task_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type SnapshotSync = {
  device_id: string;
  cursor: string | null;
  client_version: number;
  pending_operations: number;
};

export type SnapshotCounts = {
  lists: number;
  tasks: number;
  events: number;
  pending_operations: number;
};

export type TaskFlowSnapshot = {
  schema_version: typeof SNAPSHOT_SCHEMA_VERSION;
  lists: SnapshotList[];
  tasks: SnapshotTask[];
  events: SnapshotEvent[];
  sync: SnapshotSync;
  generated_at: string;
  counts: SnapshotCounts;
  checksum: string;
};

type SnapshotBody = Omit<TaskFlowSnapshot, "checksum">;

export async function createSnapshot(input: {
  lists: SnapshotList[];
  tasks: SnapshotTask[];
  events: SnapshotEvent[];
  sync: SnapshotSync;
  generatedAt?: string;
}): Promise<TaskFlowSnapshot> {
  const body = normalizeBody({
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    lists: input.lists,
    tasks: input.tasks,
    events: input.events,
    sync: input.sync,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    counts: {
      lists: input.lists.length,
      tasks: input.tasks.length,
      events: input.events.length,
      pending_operations: input.sync.pending_operations,
    },
  });
  const checksum = await sha256(canonicalize(body));
  return { ...body, checksum };
}

export async function parseSnapshot(input: unknown): Promise<TaskFlowSnapshot> {
  assertSnapshotShape(input);
  const snapshot = normalizeSnapshot(input);
  const expectedChecksum = await sha256(canonicalize(snapshotWithoutChecksum(snapshot)));
  if (snapshot.checksum !== expectedChecksum) {
    throw new SnapshotIntegrityError("El checksum del snapshot no coincide.");
  }
  validateRelationships(snapshot);
  return snapshot;
}

export function snapshotListFromDomain(list: TaskList & { createdAt?: string; updatedAt?: string; deletedAt?: string | null }): SnapshotList {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    emoji: list.emoji,
    color: list.color,
    position: list.position,
    is_archived: list.isArchived,
    is_system: list.isSystem,
    created_at: list.createdAt ?? list.updatedAt ?? new Date(0).toISOString(),
    updated_at: list.updatedAt ?? new Date(0).toISOString(),
    deleted_at: list.deletedAt ?? null,
  };
}

export function snapshotTaskFromDomain(task: Task & { deletedAt?: string | null }): SnapshotTask {
  return {
    id: task.id,
    list_id: task.listId,
    title: task.title,
    description: task.description,
    status: task.status,
    source: task.source,
    position: task.position,
    completed_at: task.completedAt,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    deleted_at: task.deletedAt ?? null,
  };
}

export function snapshotEventFromDomain(event: HistoryEntry): SnapshotEvent {
  return {
    id: event.id,
    task_id: event.taskId,
    event_type: event.eventType,
    payload: event.payload,
    created_at: event.createdAt,
  };
}

export class SnapshotIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotIntegrityError";
  }
}

function normalizeSnapshot(snapshot: TaskFlowSnapshot): TaskFlowSnapshot {
  const body = normalizeBody(snapshotWithoutChecksum(snapshot));
  return { ...body, checksum: snapshot.checksum };
}

function normalizeBody(body: SnapshotBody): SnapshotBody {
  return {
    ...body,
    lists: [...body.lists].sort((left, right) => left.id.localeCompare(right.id)),
    tasks: [...body.tasks].sort((left, right) => left.id.localeCompare(right.id)),
    events: [...body.events].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function snapshotWithoutChecksum(snapshot: TaskFlowSnapshot): SnapshotBody {
  const { checksum: _checksum, ...body } = snapshot;
  return body;
}

function assertSnapshotShape(value: unknown): asserts value is TaskFlowSnapshot {
  if (!isRecord(value)
    || value.schema_version !== SNAPSHOT_SCHEMA_VERSION
    || !Array.isArray(value.lists)
    || !Array.isArray(value.tasks)
    || !Array.isArray(value.events)
    || !isRecord(value.sync)
    || typeof value.generated_at !== "string"
    || !isRecord(value.counts)
    || typeof value.checksum !== "string") {
    throw new LocalStorageValidationError("El snapshot no cumple el contrato de la versión 1.");
  }
  if (!isIsoDate(value.generated_at) || !isSnapshotSync(value.sync) || !isSnapshotCounts(value.counts)) {
    throw new LocalStorageValidationError("Los metadatos del snapshot no son válidos.");
  }
  value.lists.forEach(assertSnapshotList);
  value.tasks.forEach(assertSnapshotTask);
  value.events.forEach(assertSnapshotEvent);
  if (!/^[a-f0-9]{64}$/.test(value.checksum)) {
    throw new LocalStorageValidationError("El checksum del snapshot no es SHA-256 hexadecimal.");
  }
  if (value.counts.lists !== value.lists.length
    || value.counts.tasks !== value.tasks.length
    || value.counts.events !== value.events.length
    || value.counts.pending_operations !== value.sync.pending_operations) {
    throw new SnapshotIntegrityError("Los counts del snapshot no coinciden con sus colecciones.");
  }
}

function validateRelationships(snapshot: TaskFlowSnapshot): void {
  const listIds = new Set(snapshot.lists.map((list) => list.id));
  if (snapshot.tasks.some((task) => !listIds.has(task.list_id))) {
    throw new SnapshotIntegrityError("El snapshot contiene una tarea sin lista propietaria.");
  }
}

function assertSnapshotList(value: unknown): asserts value is SnapshotList {
  if (!isRecord(value)
    || !isUuid(value.id)
    || !isNonEmptyString(value.name, 120)
    || !isString(value.description, 5000)
    || !isString(value.emoji, 16)
    || !isString(value.color, 32)
    || !isNonNegativeInteger(value.position)
    || typeof value.is_archived !== "boolean"
    || typeof value.is_system !== "boolean"
    || !isIsoDate(value.created_at)
    || !isIsoDate(value.updated_at)
    || !isNullableIsoDate(value.deleted_at)) {
    throw new LocalStorageValidationError("Una lista del snapshot no es válida.");
  }
}

function assertSnapshotTask(value: unknown): asserts value is SnapshotTask {
  if (!isRecord(value)
    || !isUuid(value.id)
    || !isUuid(value.list_id)
    || !isNonEmptyString(value.title, 500)
    || !isString(value.description, 10000)
    || (value.status !== "pending" && value.status !== "completed")
    || !["manual", "voice", "ai", "import"].includes(value.source as string)
    || !isNonNegativeInteger(value.position)
    || !isNullableIsoDate(value.completed_at)
    || !isIsoDate(value.created_at)
    || !isIsoDate(value.updated_at)
    || !isNullableIsoDate(value.deleted_at)) {
    throw new LocalStorageValidationError("Una tarea del snapshot no es válida.");
  }
}

function assertSnapshotEvent(value: unknown): asserts value is SnapshotEvent {
  if (!isRecord(value)
    || !isUuid(value.id)
    || (value.task_id !== null && !isUuid(value.task_id))
    || !isNonEmptyString(value.event_type, 80)
    || !isRecord(value.payload)
    || !isIsoDate(value.created_at)) {
    throw new LocalStorageValidationError("Un evento del snapshot no es válido.");
  }
}

function isSnapshotSync(value: Record<string, unknown>): value is SnapshotSync {
  return isUuid(value.device_id)
    && (value.cursor === null || (typeof value.cursor === "string" && value.cursor.length > 0))
    && isNonNegativeInteger(value.client_version)
    && isNonNegativeInteger(value.pending_operations);
}

function isSnapshotCounts(value: Record<string, unknown>): value is SnapshotCounts {
  return isNonNegativeInteger(value.lists)
    && isNonNegativeInteger(value.tasks)
    && isNonNegativeInteger(value.events)
    && isNonNegativeInteger(value.pending_operations);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}