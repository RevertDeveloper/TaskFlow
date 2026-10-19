import type { HistoryEntry } from "@/domain/history/models";
import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import type { Note } from "@/domain/note/models";
import type { SyncChange, SyncEntityVersion, SyncMergeDecider } from "@/domain/sync/models";
import { openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import { buildSearchIndex } from "@/infrastructure/indexeddb/IndexedDbNoteRepository";
import { LocalStorageValidationError } from "@/infrastructure/indexeddb/errors";
import {
  assertLocalFolderRecord,
  assertLocalListRecord,
  assertLocalNoteRecord,
  assertLocalTaskRecord,
  isUuid,
  type LocalFolderRecord,
  type LocalListRecord,
  type LocalNoteRecord,
  type LocalTaskRecord,
} from "@/infrastructure/indexeddb/schema";

export type ReplicaConflict = {
  entityType: SyncChange["entityType"];
  entityId: string;
  resolution: "remote" | "local";
};

export class LocalReplica {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async saveLists(lists: TaskList[]): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction("rw", this.database.lists, async () => {
      const now = new Date().toISOString();
      for (const list of lists) {
        const existing = await this.database.lists.get(list.id);
        const record: LocalListRecord = {
          ...list,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
          syncClientVersion: existing?.syncClientVersion ?? 0,
          syncOperationId: existing?.syncOperationId ?? null,
        };
        await this.database.lists.put(record);
      }
    });
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction("rw", this.database.tasks, async () => {
      const now = new Date().toISOString();
      for (const task of tasks) {
        const existing = await this.database.tasks.get(task.id);
        const record: LocalTaskRecord = {
          ...task,
          createdAt: existing?.createdAt ?? task.createdAt ?? now,
          updatedAt: task.updatedAt ?? now,
          deletedAt: null,
          syncClientVersion: existing?.syncClientVersion ?? 0,
          syncOperationId: existing?.syncOperationId ?? null,
        };
        await this.database.tasks.put(record);
      }
    });
  }

  async saveHistory(entries: HistoryEntry[]): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction("rw", this.database.taskEvents, async () => {
      await this.database.taskEvents.bulkPut(entries);
    });
  }

  async markListDeleted(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.lists.get(id);
    if (record) {
      await this.database.lists.put({ ...record, deletedAt: new Date().toISOString() });
    }
  }

  async markTaskDeleted(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.tasks.get(id);
    if (record) {
      await this.database.tasks.put({ ...record, deletedAt: new Date().toISOString() });
    }
  }

  async applyChanges(
    changes: SyncChange[],
    decider: SyncMergeDecider = defaultMergeDecider,
  ): Promise<ReplicaConflict[]> {
    await openTaskFlowDatabase(this.database);
    return this.database.transaction("rw", this.database.lists, this.database.tasks, this.database.notes, this.database.folders, async () => {
      const conflicts: ReplicaConflict[] = [];
      for (const change of changes) {
        if (change.entityType === "list") {
          const existing = await this.database.lists.get(change.entityId);
          const resolution = decider(toEntityVersion(existing), change);
          if (existing && resolution === "local") {
            conflicts.push({ entityType: "list", entityId: change.entityId, resolution });
            continue;
          }
          const record = toLocalListRecord(change);
          assertLocalListRecord(record);
          await this.database.lists.put(record);
          if (existing) {
            conflicts.push({ entityType: "list", entityId: change.entityId, resolution });
          }
          continue;
        }

        if (change.entityType === "note") {
          const existing = await this.database.notes.get(change.entityId);
          const resolution = decider(toEntityVersion(existing), change);
          if (existing && resolution === "local") {
            conflicts.push({ entityType: "note", entityId: change.entityId, resolution });
            continue;
          }
          const record = toLocalNoteRecord(change);
          assertLocalNoteRecord(record);
          await this.database.notes.put(record);
          if (existing) conflicts.push({ entityType: "note", entityId: change.entityId, resolution });
          continue;
        }

        if (change.entityType === "folder") {
          const existing = await this.database.folders.get(change.entityId);
          const resolution = decider(toEntityVersion(existing), change);
          if (existing && resolution === "local") {
            conflicts.push({ entityType: "folder", entityId: change.entityId, resolution });
            continue;
          }
          const record = toLocalFolderRecord(change, existing?.emoji ?? "");
          assertLocalFolderRecord(record);
          await this.database.folders.put(record);
          if (existing) conflicts.push({ entityType: "folder", entityId: change.entityId, resolution });
          continue;
        }

        const existing = await this.database.tasks.get(change.entityId);
        const resolution = decider(toEntityVersion(existing), change);
        if (existing && resolution === "local") {
          conflicts.push({ entityType: "task", entityId: change.entityId, resolution });
          continue;
        }
        const record = toLocalTaskRecord(change);
        assertLocalTaskRecord(record);
        await this.database.tasks.put(record);
        if (existing) {
          conflicts.push({ entityType: "task", entityId: change.entityId, resolution });
        }
      }
      return conflicts;
    });
  }
}

function defaultMergeDecider(localVersion: SyncEntityVersion | null, change: SyncChange): "remote" | "local" {
  if (!localVersion) {
    return "remote";
  }
  if (change.updatedAt !== localVersion.updatedAt) {
    return change.updatedAt > localVersion.updatedAt ? "remote" : "local";
  }
  if (change.clientVersion !== localVersion.clientVersion) {
    return change.clientVersion > localVersion.clientVersion ? "remote" : "local";
  }
  return (change.operationId ?? "") >= (localVersion.operationId ?? "") ? "remote" : "local";
}

function toEntityVersion(
  entity: { updatedAt: string; syncClientVersion?: number; syncOperationId?: string | null } | undefined,
): SyncEntityVersion | null {
  if (!entity) {
    return null;
  }
  return {
    updatedAt: entity.updatedAt,
    clientVersion: entity.syncClientVersion ?? 0,
    operationId: entity.syncOperationId ?? null,
  };
}

function toLocalNoteRecord(change: SyncChange): LocalNoteRecord {
  const data = change.data;
  const note: Note = {
    id: change.entityId,
    folderId: readNullableUuid(data.folderId, "folderId"),
    title: typeof data.title === "string" ? data.title : "",
    blocks: Array.isArray(data.blocks) ? data.blocks as Note["blocks"] : [],
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [],
    pinned: data.pinned === true,
    archivedAt: readNullableString(data.archivedAt, "archivedAt"),
    deletedAt: change.operation === "delete" ? change.updatedAt : readNullableString(data.deletedAt, "deletedAt"),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : change.updatedAt,
    updatedAt: change.updatedAt,
  };
  return {
    ...note,
    searchIndex: buildSearchIndex(note),
    syncClientVersion: change.clientVersion,
    syncOperationId: change.operationId,
  };
}

function toLocalFolderRecord(change: SyncChange, existingEmoji: string): LocalFolderRecord {
  const data = change.data;
  return {
    id: readUuid(data.id, "id", change.entityId),
    parentId: readNullableUuid(data.parentId, "parentId"),
    name: readString(data.name, "name"),
    emoji: typeof data.emoji === "string" ? data.emoji : existingEmoji,
    position: readNonNegativeInteger(data.position, "position"),
    createdAt: readString(data.createdAt, "createdAt"),
    updatedAt: change.updatedAt,
    deletedAt: change.operation === "delete" ? change.updatedAt : readNullableString(data.deletedAt, "deletedAt"),
  };
}

function toLocalListRecord(change: SyncChange): LocalListRecord {
  const data = change.data;
  return {
    id: readUuid(data.id, "id", change.entityId),
    name: readString(data.name, "name"),
    description: readString(data.description, "description"),
    emoji: readString(data.emoji, "emoji"),
    color: readString(data.color, "color"),
    position: readNonNegativeInteger(data.position, "position"),
    isArchived: readBoolean(data.isArchived, "isArchived"),
    isSystem: readBoolean(data.isSystem, "isSystem"),
    createdAt: readString(data.createdAt, "createdAt"),
    updatedAt: change.updatedAt,
    deletedAt: change.operation === "delete" ? change.updatedAt : readNullableString(data.deletedAt, "deletedAt"),
    syncClientVersion: change.clientVersion,
    syncOperationId: change.operationId,
  };
}

function toLocalTaskRecord(change: SyncChange): LocalTaskRecord {
  const data = change.data;
  return {
    id: readUuid(data.id, "id", change.entityId),
    listId: readUuid(data.listId, "listId"),
    title: readString(data.title, "title"),
    description: readString(data.description, "description"),
    status: readTaskStatus(data.status),
    source: readTaskSource(data.source),
    position: readNonNegativeInteger(data.position, "position"),
    completedAt: readNullableString(data.completedAt, "completedAt"),
    createdAt: readString(data.createdAt, "createdAt"),
    updatedAt: change.updatedAt,
    deletedAt: change.operation === "delete" ? change.updatedAt : readNullableString(data.deletedAt, "deletedAt"),
    syncClientVersion: change.clientVersion,
    syncOperationId: change.operationId,
  };
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new LocalStorageValidationError(`El campo remoto ${field} no es válido.`);
  }
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, field);
}

function readNullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  return readUuid(value, field);
}

function readUuid(value: unknown, field: string, expected?: string): string {
  if (!isUuid(value) || (expected !== undefined && value !== expected)) {
    throw new LocalStorageValidationError(`El UUID remoto ${field} no es válido.`);
  }
  return value;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new LocalStorageValidationError(`El campo remoto ${field} no es válido.`);
  }
  return value;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new LocalStorageValidationError(`El campo remoto ${field} no es válido.`);
  }
  return value;
}

function readTaskStatus(value: unknown): Task["status"] {
  if (value !== "pending" && value !== "completed") {
    throw new LocalStorageValidationError("El estado remoto de la tarea no es válido.");
  }
  return value;
}

function readTaskSource(value: unknown): Task["source"] {
  if (value !== "manual" && value !== "voice" && value !== "ai" && value !== "import") {
    throw new LocalStorageValidationError("El origen remoto de la tarea no es válido.");
  }
  return value;
}