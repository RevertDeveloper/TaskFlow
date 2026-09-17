import type { HistoryRepository } from "@/domain/history/ports";
import type { ListDraft, ListPatch, TaskList } from "@/domain/list/models";
import type { ListRepository } from "@/domain/list/ports";
import type { SyncRepository } from "@/domain/sync/ports";
import type { Task, TaskDraft, TaskPatch } from "@/domain/task/models";
import type { TaskRepository } from "@/domain/task/ports";
import {
  APP_STATE_KEYS,
  assertJsonObject,
  assertLocalListRecord,
  assertLocalSyncOperationRecord,
  assertLocalTaskRecord,
  assertUuid,
  type JsonObject,
  type LocalListRecord,
  type LocalSyncOperationRecord,
  type LocalTaskEventRecord,
  type LocalTaskRecord,
} from "../indexeddb/schema";
import { createUuid, getDeviceId, openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "../indexeddb/database";
import {
  LocalStorageError,
  LocalStorageQuotaError,
  LocalStorageTransactionError,
  LocalStorageValidationError,
} from "../indexeddb/errors";
import { IndexedDbHistoryRepository } from "../indexeddb/IndexedDbHistoryRepository";
import { IndexedDbListRepository, getList } from "../indexeddb/IndexedDbListRepository";
import { IndexedDbSyncRepository } from "../indexeddb/IndexedDbSyncRepository";
import { IndexedDbTaskRepository, getTask } from "../indexeddb/IndexedDbTaskRepository";

export type LocalMutationOptions = {
  idempotencyKey?: string;
  occurredAt?: string;
};

export type LocalTransactionRunner = <Result>(work: () => Promise<Result>) => Promise<Result>;

export type LocalRepositoryOptions = {
  database?: TaskFlowDatabase;
  maxAttempts?: number;
  transactionRunner?: LocalTransactionRunner;
};

type MutationInput<Result> = {
  entityType: "list" | "task";
  entityId: string;
  operation: "create" | "update" | "delete";
  idempotencyKey: string;
  occurredAt: string;
  eventType: string;
  taskId: string | null;
  payload: JsonObject;
  mutate: () => Promise<Result>;
  recover: (existing?: LocalSyncOperationRecord) => Promise<Result>;
};

export class LocalRepository {
  readonly lists: ListRepository;
  readonly tasks: TaskRepository;
  readonly history: HistoryRepository;
  readonly sync: SyncRepository;

  private readonly database: TaskFlowDatabase;
  private readonly maxAttempts: number;
  private readonly transactionRunner: LocalTransactionRunner;
  private readonly listReader: IndexedDbListRepository;
  private readonly taskReader: IndexedDbTaskRepository;

  constructor(options: LocalRepositoryOptions = {}) {
    this.database = options.database ?? taskFlowDatabase;
    this.maxAttempts = validateMaxAttempts(options.maxAttempts ?? 2);
    this.transactionRunner = options.transactionRunner ?? this.createTransactionRunner();
    this.listReader = new IndexedDbListRepository(this.database);
    this.taskReader = new IndexedDbTaskRepository(this.database);
    this.history = new IndexedDbHistoryRepository(this.database);
    this.sync = new IndexedDbSyncRepository(this.database);
    this.lists = {
      findAll: () => this.listReader.findAll(),
      create: (input) => this.createList(input),
      update: (id, input) => this.updateList(id, input),
      delete: (id) => this.deleteList(id),
    };
    this.tasks = {
      findAll: () => this.taskReader.findAll(),
      create: (input) => this.createTask(input),
      update: (id, input) => this.updateTask(id, input),
      complete: (id) => this.completeTask(id),
      reopen: (id) => this.reopenTask(id),
      delete: (id) => this.deleteTask(id),
    };
  }

  getDatabase(): TaskFlowDatabase {
    return this.database;
  }

  async createList(input: ListDraft, options: LocalMutationOptions = {}): Promise<TaskList> {
    const entityId = createUuid();
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const name = validateListName(input.name);
    const description = input.description?.trim() ?? "";
    const emoji = input.emoji?.trim() ?? "";
    const color = input.color?.trim() ?? "";
    return this.atomicMutation({
      entityType: "list",
      entityId,
      operation: "create",
      idempotencyKey,
      occurredAt,
      eventType: "LIST_CREATED",
      taskId: null,
      payload: { entityId, name, description, emoji, color },
      mutate: async () => {
        const records = await this.database.lists.toArray();
        records.forEach(assertLocalListRecord);
        const now = new Date().toISOString();
        const record: LocalListRecord = {
          id: entityId,
          name,
          description,
          emoji,
          color,
          position: nextPosition(records),
          isArchived: false,
          isSystem: false,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await this.database.lists.add(record);
        return toTaskList(record);
      },
      recover: async (existing) => toTaskList(await getStoredList(this.database, existing?.entityId ?? entityId)),
    });
  }

  async updateList(id: string, input: ListPatch, options: LocalMutationOptions = {}): Promise<TaskList> {
    assertUuid(id, "El id de la lista");
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    return this.atomicMutation({
      entityType: "list",
      entityId: id,
      operation: "update",
      idempotencyKey,
      occurredAt,
      eventType: input.isArchived ? "LIST_ARCHIVED" : "LIST_UPDATED",
      taskId: null,
      payload: compactPayload({
        entityId: id,
        name: input.name,
        description: input.description,
        emoji: input.emoji,
        color: input.color,
        isArchived: input.isArchived,
      }),
      mutate: async () => {
        const record = await getList(this.database, id);
        if (record.isSystem && input.isArchived) {
          throw new LocalStorageValidationError("La lista Inbox no se puede archivar.");
        }
        const updated: LocalListRecord = {
          ...record,
          name: input.name === undefined ? record.name : validateListName(input.name),
          description: input.description === undefined ? record.description : input.description.trim(),
          emoji: input.emoji === undefined ? record.emoji : input.emoji.trim(),
          color: input.color === undefined ? record.color : input.color.trim(),
          isArchived: input.isArchived ?? record.isArchived,
          updatedAt: new Date().toISOString(),
        };
        await this.database.lists.put(updated);
        return toTaskList(updated);
      },
      recover: async () => toTaskList(await getStoredList(this.database, id)),
    });
  }

  async deleteList(id: string, options: LocalMutationOptions = {}): Promise<void> {
    assertUuid(id, "El id de la lista");
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    await this.atomicMutation({
      entityType: "list",
      entityId: id,
      operation: "delete",
      idempotencyKey,
      occurredAt,
      eventType: "LIST_DELETED",
      taskId: null,
      payload: { entityId: id },
      mutate: async () => {
        const record = await getList(this.database, id);
        if (record.isSystem) {
          throw new LocalStorageValidationError("La lista Inbox no se puede eliminar.");
        }
        const inbox = (await this.database.lists.toArray())
          .map((candidate) => {
            assertLocalListRecord(candidate);
            return candidate;
          })
          .find((candidate) => candidate.isSystem && candidate.deletedAt === null);
        if (!inbox) {
          throw new LocalStorageError("unknown", "No existe una Inbox disponible para conservar las tareas.");
        }
        const tasks = await this.database.tasks.where("listId").equals(id).toArray();
        tasks.forEach(assertLocalTaskRecord);
        const now = new Date().toISOString();
        for (const task of tasks) {
          if (task.deletedAt === null) {
            await this.database.tasks.put({ ...task, listId: inbox.id, updatedAt: now });
          }
        }
        await this.database.lists.put({ ...record, deletedAt: now, updatedAt: now });
        return undefined;
      },
      recover: async () => undefined,
    });
  }

  async createTask(input: TaskDraft, options: LocalMutationOptions = {}): Promise<Task> {
    const entityId = createUuid();
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    const title = validateTaskTitle(input.title);
    const description = input.description?.trim() ?? "";
    return this.atomicMutation({
      entityType: "task",
      entityId,
      operation: "create",
      idempotencyKey,
      occurredAt,
      eventType: "TASK_CREATED",
      taskId: entityId,
      payload: { entityId, listId: input.listId, title, description, source: "manual" },
      mutate: async () => {
        const list = await getList(this.database, input.listId);
        if (list.isArchived) {
          throw new LocalStorageValidationError("No se pueden crear tareas en una lista archivada.");
        }
        const records = await this.database.tasks.where("listId").equals(list.id).toArray();
        records.forEach(assertLocalTaskRecord);
        const now = new Date().toISOString();
        const record: LocalTaskRecord = {
          id: entityId,
          listId: list.id,
          title,
          description,
          status: "pending",
          source: "manual",
          position: records.reduce((highest, task) => Math.max(highest, task.position), -1) + 1,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await this.database.tasks.add(record);
        return toTask(record);
      },
      recover: async () => toTask(await getStoredTask(this.database, entityId)),
    });
  }

  async updateTask(id: string, input: TaskPatch, options: LocalMutationOptions = {}): Promise<Task> {
    assertUuid(id, "El id de la tarea");
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    return this.atomicMutation({
      entityType: "task",
      entityId: id,
      operation: "update",
      idempotencyKey,
      occurredAt,
      eventType: input.listId === undefined ? "TASK_UPDATED" : "TASK_MOVED",
      taskId: id,
      payload: compactPayload({
        entityId: id,
        listId: input.listId,
        title: input.title,
        description: input.description,
      }),
      mutate: async () => {
        const record = await getTask(this.database, id);
        const list = await getList(this.database, input.listId ?? record.listId);
        if (list.isArchived && list.id !== record.listId) {
          throw new LocalStorageValidationError("No se pueden mover tareas a una lista archivada.");
        }
        const updated: LocalTaskRecord = {
          ...record,
          listId: list.id,
          title: input.title === undefined ? record.title : validateTaskTitle(input.title),
          description: input.description === undefined ? record.description : input.description.trim(),
          updatedAt: new Date().toISOString(),
        };
        await this.database.tasks.put(updated);
        return toTask(updated);
      },
      recover: async () => toTask(await getStoredTask(this.database, id)),
    });
  }

  async completeTask(id: string, options: LocalMutationOptions = {}): Promise<Task> {
    return this.setTaskStatus(id, "completed", options);
  }

  async reopenTask(id: string, options: LocalMutationOptions = {}): Promise<Task> {
    return this.setTaskStatus(id, "pending", options);
  }

  async deleteTask(id: string, options: LocalMutationOptions = {}): Promise<void> {
    assertUuid(id, "El id de la tarea");
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    await this.atomicMutation({
      entityType: "task",
      entityId: id,
      operation: "delete",
      idempotencyKey,
      occurredAt,
      eventType: "TASK_DELETED",
      taskId: id,
      payload: { entityId: id },
      mutate: async () => {
        const record = await getTask(this.database, id);
        const now = new Date().toISOString();
        await this.database.tasks.put({ ...record, deletedAt: now, updatedAt: now });
        return undefined;
      },
      recover: async () => undefined,
    });
  }

  private async setTaskStatus(id: string, status: Task["status"], options: LocalMutationOptions): Promise<Task> {
    assertUuid(id, "El id de la tarea");
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    return this.atomicMutation({
      entityType: "task",
      entityId: id,
      operation: "update",
      idempotencyKey,
      occurredAt,
      eventType: status === "completed" ? "TASK_COMPLETED" : "TASK_REOPENED",
      taskId: id,
      payload: { entityId: id, status },
      mutate: async () => {
        const record = await getTask(this.database, id);
        const updated: LocalTaskRecord = {
          ...record,
          status,
          completedAt: status === "completed" ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        };
        await this.database.tasks.put(updated);
        return toTask(updated);
      },
      recover: async () => toTask(await getStoredTask(this.database, id)),
    });
  }

  private async atomicMutation<Result>(input: MutationInput<Result>): Promise<Result> {
    assertUuid(input.entityId, "El id de la entidad");
    assertUuid(input.idempotencyKey, "La clave de idempotencia");
    assertJsonObject(input.payload, "El payload de sincronización");
    await openTaskFlowDatabase(this.database);
    const deviceId = await getDeviceId(this.database);
    return this.runWithRetries(() => this.transactionRunner(async () => {
      const existing = await this.database.syncOperations.where("idempotencyKey").equals(input.idempotencyKey).first();
      if (existing) {
        assertLocalSyncOperationRecord(existing);
        validateIdempotentReplay(existing, input);
        return input.recover(existing);
      }

      const result = await input.mutate();
      const clientVersion = await nextClientVersion(this.database);
      const event: LocalTaskEventRecord = {
        id: createUuid(),
        taskId: input.taskId,
        eventType: input.eventType,
        payload: input.payload,
        createdAt: input.occurredAt,
      };
      const operation: LocalSyncOperationRecord = {
        id: createUuid(),
        deviceId,
        entityType: input.entityType,
        entityId: input.entityId,
        operation: input.operation,
        clientVersion,
        occurredAt: input.occurredAt,
        processedAt: null,
        idempotencyKey: input.idempotencyKey,
        payloadVersion: 1,
        payload: input.payload,
      };
      await this.database.taskEvents.add(event);
      await this.database.syncOperations.add(operation);
      return result;
    }));
  }

  private createTransactionRunner(): LocalTransactionRunner {
    return (work) => this.database.transaction(
      "rw",
      this.database.lists,
      this.database.tasks,
      this.database.taskEvents,
      this.database.syncOperations,
      this.database.appState,
      work,
    );
  }

  private async runWithRetries<Result>(operation: () => Promise<Result>): Promise<Result> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const normalized = normalizeStorageError(error);
        if (!isRetryableTransactionError(error) || attempt === this.maxAttempts) {
          throw normalized;
        }
      }
    }
    throw new LocalStorageTransactionError("La operación local no pudo completarse.");
  }
}

async function nextClientVersion(database: TaskFlowDatabase): Promise<number> {
  const current = await database.appState.get(APP_STATE_KEYS.clientVersion);
  if (current && (typeof current.value !== "number" || !Number.isInteger(current.value) || current.value < 0)) {
    throw new LocalStorageValidationError("La versión local de cliente está corrupta.");
  }
  const next = (typeof current?.value === "number" ? current.value : 0) + 1;
  await database.appState.put({ key: APP_STATE_KEYS.clientVersion, value: next });
  return next;
}

async function getStoredList(database: TaskFlowDatabase, id: string): Promise<LocalListRecord> {
  const record = await database.lists.get(id);
  if (!record) {
    throw new LocalStorageError("unknown", "La lista local no está disponible tras el reintento.");
  }
  assertLocalListRecord(record);
  return record;
}

async function getStoredTask(database: TaskFlowDatabase, id: string): Promise<LocalTaskRecord> {
  const record = await database.tasks.get(id);
  if (!record) {
    throw new LocalStorageError("unknown", "La tarea local no está disponible tras el reintento.");
  }
  assertLocalTaskRecord(record);
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

function validateListName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new LocalStorageValidationError("El nombre de la lista debe tener entre 1 y 120 caracteres.");
  }
  return normalized;
}

function validateTaskTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0 || normalized.length > 500) {
    throw new LocalStorageValidationError("El título de la tarea debe tener entre 1 y 500 caracteres.");
  }
  return normalized;
}

function nextPosition(records: LocalListRecord[]): number {
  return records.reduce((highest, record) => Math.max(highest, record.position), -1) + 1;
}

function compactPayload(values: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as JsonObject;
}

function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value ?? createUuid();
  assertUuid(key, "La clave de idempotencia");
  return key;
}

function validateIdempotentReplay(existing: LocalSyncOperationRecord, input: MutationInput<unknown>): void {
  if (existing.entityType !== input.entityType
    || existing.operation !== input.operation
    || existing.payloadVersion !== 1
    || (input.operation !== "create" && existing.entityId !== input.entityId)
    || JSON.stringify(comparablePayload(existing.payload, input.operation)) !== JSON.stringify(comparablePayload(input.payload, input.operation))) {
    throw new LocalStorageValidationError("La clave de idempotencia ya pertenece a otra operación.");
  }
}

function comparablePayload(payload: JsonObject, operation: MutationInput<unknown>["operation"]): JsonObject {
  if (operation !== "create") {
    return payload;
  }
  return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "entityId")) as JsonObject;
}

function validateMaxAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new RangeError("El número de reintentos debe estar entre 1 y 3.");
  }
  return value;
}

function normalizeStorageError(error: unknown): LocalStorageError {
  if (error instanceof LocalStorageError) {
    return error;
  }
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") {
    return new LocalStorageQuotaError({ cause: error });
  }
  if (isRetryableTransactionError(error)) {
    return new LocalStorageTransactionError("La transacción local fue interrumpida.", { cause: error });
  }
  return new LocalStorageError("unknown", "No se pudo guardar la operación local.", { cause: error });
}

function isRetryableTransactionError(error: unknown): boolean {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TransactionInactiveError" || name === "InvalidStateError";
}