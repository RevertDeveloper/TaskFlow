import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import type { TaskRepository } from "@/domain/task/ports";
import { createUuid, openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { getList } from "./IndexedDbListRepository";
import { LocalStorageError, LocalStorageValidationError } from "./errors";
import { assertLocalTaskRecord, type LocalTaskRecord } from "./schema";

export class IndexedDbTaskRepository implements TaskRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findAll(): Promise<Task[]> {
    await openTaskFlowDatabase(this.database);
    const records = await this.database.tasks.orderBy("position").toArray();
    return records.flatMap((record) => {
      assertLocalTaskRecord(record);
      return record.deletedAt === null ? [toTask(record)] : [];
    });
  }

  async create(input: TaskDraft): Promise<Task> {
    await openTaskFlowDatabase(this.database);
    const list = await getList(this.database, input.listId);
    if (list.isArchived) {
      throw new LocalStorageValidationError("No se pueden crear tareas en una lista archivada.");
    }
    const title = validateTitle(input.title);
    const now = new Date().toISOString();
    const record: LocalTaskRecord = {
      id: createUuid(),
      listId: list.id,
      title,
      description: input.description?.trim() ?? "",
      status: "pending",
      source: "manual",
      position: await nextPosition(this.database, list.id),
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.database.tasks.add(record);
    return toTask(record);
  }

  async update(id: string, input: TaskPatch): Promise<Task> {
    await openTaskFlowDatabase(this.database);
    const record = await getTask(this.database, id);
    const listId = input.listId ?? record.listId;
    const list = await getList(this.database, listId);
    if (list.isArchived && list.id !== record.listId) {
      throw new LocalStorageValidationError("No se pueden mover tareas a una lista archivada.");
    }
    const updated: LocalTaskRecord = {
      ...record,
      listId,
      title: input.title === undefined ? record.title : validateTitle(input.title),
      description: input.description === undefined ? record.description : input.description.trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.database.tasks.put(updated);
    return toTask(updated);
  }

  async complete(id: string): Promise<Task> {
    return this.setStatus(id, "completed");
  }

  async reopen(id: string): Promise<Task> {
    return this.setStatus(id, "pending");
  }

  async delete(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const record = await getTask(this.database, id);
    const now = new Date().toISOString();
    await this.database.tasks.put({ ...record, deletedAt: now, updatedAt: now });
  }

  private async setStatus(id: string, status: Task["status"]): Promise<Task> {
    await openTaskFlowDatabase(this.database);
    const record = await getTask(this.database, id);
    const updated: LocalTaskRecord = {
      ...record,
      status,
      completedAt: status === "completed" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    await this.database.tasks.put(updated);
    return toTask(updated);
  }
}

export async function getTask(database: TaskFlowDatabase, id: string): Promise<LocalTaskRecord> {
  const record = await database.tasks.get(id);
  if (!record) {
    throw new LocalStorageError("unknown", "La tarea solicitada no existe en el dispositivo.");
  }
  assertLocalTaskRecord(record);
  if (record.deletedAt !== null) {
    throw new LocalStorageError("unknown", "La tarea solicitada no existe en el dispositivo.");
  }
  return record;
}

function toTask(record: LocalTaskRecord): Task {
  return {
    id: record.id,
    listId: record.listId,
    title: record.title,
    description: record.description,
    status: record.status,
    source: record.source,
    position: record.position,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function validateTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0 || normalized.length > 500) {
    throw new LocalStorageValidationError("El título de la tarea debe tener entre 1 y 500 caracteres.");
  }
  return normalized;
}

async function nextPosition(database: TaskFlowDatabase, listId: string): Promise<number> {
  const records = await database.tasks.where("listId").equals(listId).toArray();
  records.forEach(assertLocalTaskRecord);
  return records.reduce((highest, record) => Math.max(highest, record.position), -1) + 1;
}