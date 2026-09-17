import type { HistoryEntry } from "@/domain/history/models";
import type { TaskList } from "@/domain/list/models";
import type { Task } from "@/domain/task/models";
import type { SyncChange, SyncMergeDecider } from "@/domain/sync/models";
import { openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import {
  assertLocalListRecord,
  assertLocalTaskRecord,
  isUuid,
  type LocalListRecord,
  type LocalTaskRecord,
} from "@/infrastructure/indexeddb/schema";
import { LocalStorageValidationError } from "@/infrastructure/indexeddb/errors";

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
    return this.database.transaction("rw", this.database.lists, this.database.tasks, async () => {
      const conflicts: ReplicaConflict[] = [];
      for (const change of changes) {
        if (change.entityType === "list") {
          const existing = await this.database.lists.get(change.entityId);
          const resolution = decider(existing?.updatedAt ?? null, change);
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

        const existing = await this.database.tasks.get(change.entityId);
        const resolution = decider(existing?.updatedAt ?? null, change);
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

function defaultMergeDecider(localUpdatedAt: string | null, change: SyncChange): "remote" | "local" {
  if (!localUpdatedAt) {
    return "remote";
  }
  return change.updatedAt >= localUpdatedAt ? "remote" : "local";
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