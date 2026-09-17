import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import type { ListRepository } from "@/domain/list/ports";
import { LocalStorageError, LocalStorageValidationError } from "./errors";
import { createUuid, openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { assertLocalListRecord, type LocalListRecord } from "./schema";

export class IndexedDbListRepository implements ListRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findAll(): Promise<TaskList[]> {
    await openTaskFlowDatabase(this.database);
    const records = await this.database.lists.orderBy("position").toArray();
    return records.flatMap((record) => {
      assertLocalListRecord(record);
      return record.deletedAt === null ? [toTaskList(record)] : [];
    });
  }

  async create(input: ListDraft): Promise<TaskList> {
    await openTaskFlowDatabase(this.database);
    const name = validateName(input.name);
    const records = await this.database.lists.toArray();
    records.forEach(assertLocalListRecord);
    const now = new Date().toISOString();
    const record: LocalListRecord = {
      id: createUuid(),
      name,
      description: input.description?.trim() ?? "",
      emoji: input.emoji?.trim() ?? "",
      color: input.color?.trim() ?? "",
      position: nextPosition(records),
      isArchived: false,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.database.lists.add(record);
    return toTaskList(record);
  }

  async update(id: string, input: ListPatch): Promise<TaskList> {
    await openTaskFlowDatabase(this.database);
    const record = await getList(this.database, id);
    if (record.isSystem && input.isArchived) {
      throw new LocalStorageValidationError("La lista Inbox no se puede archivar.");
    }
    const updated: LocalListRecord = {
      ...record,
      name: input.name === undefined ? record.name : validateName(input.name),
      description: input.description === undefined ? record.description : input.description.trim(),
      emoji: input.emoji === undefined ? record.emoji : input.emoji.trim(),
      color: input.color === undefined ? record.color : input.color.trim(),
      isArchived: input.isArchived ?? record.isArchived,
      updatedAt: new Date().toISOString(),
    };
    await this.database.lists.put(updated);
    return toTaskList(updated);
  }

  async delete(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await getList(this.database, id);
    if (record.isSystem) {
      throw new LocalStorageValidationError("La lista Inbox no se puede eliminar.");
    }
    await this.database.lists.put({ ...record, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
}

export async function getList(database: TaskFlowDatabase, id: string): Promise<LocalListRecord> {
  const record = await database.lists.get(id);
  if (!record) {
    throw new LocalStorageError("unknown", "La lista solicitada no existe en el dispositivo.");
  }
  assertLocalListRecord(record);
  if (record.deletedAt !== null) {
    throw new LocalStorageError("unknown", "La lista solicitada no existe en el dispositivo.");
  }
  return record;
}

function toTaskList(record: LocalListRecord): TaskList {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    emoji: record.emoji,
    color: record.color,
    position: record.position,
    isArchived: record.isArchived,
    isSystem: record.isSystem,
  };
}

function validateName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new LocalStorageValidationError("El nombre de la lista debe tener entre 1 y 120 caracteres.");
  }
  return normalized;
}

function nextPosition(records: LocalListRecord[]): number {
  return records.reduce((highest, record) => Math.max(highest, record.position), -1) + 1;
}