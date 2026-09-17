import type { ApiRepositoryBundle } from "@/infrastructure/repositories/apiRepositories";
import { createUuid, openTaskFlowDatabase, type TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import {
  APP_STATE_KEYS,
  assertLocalListRecord,
  assertLocalSyncOperationRecord,
  assertLocalTaskEventRecord,
  assertLocalTaskRecord,
  type LocalAppStateRecord,
  type LocalListRecord,
  type LocalSyncOperationRecord,
  type LocalTaskEventRecord,
  type LocalTaskRecord,
} from "@/infrastructure/indexeddb/schema";
import { LocalStorageValidationError } from "@/infrastructure/indexeddb/errors";
import { LocalRepository } from "@/infrastructure/repositories/LocalRepository";
import type { HistoryEntry } from "@/domain/history/models";
import {
  createSnapshot,
  parseSnapshot,
  snapshotEventFromDomain,
  snapshotListFromDomain,
  snapshotTaskFromDomain,
  type SnapshotEvent,
  type SnapshotList,
  type SnapshotTask,
  type TaskFlowSnapshot,
} from "./Snapshot";

export type LocalDatabaseBackup = {
  lists: LocalListRecord[];
  tasks: LocalTaskRecord[];
  events: LocalTaskEventRecord[];
  syncOperations: LocalSyncOperationRecord[];
  appState: LocalAppStateRecord[];
};

export class SnapshotService {
  constructor(
    private readonly database: TaskFlowDatabase,
    private readonly localRepository = new LocalRepository({ database }),
    private readonly apiRepositories?: ApiRepositoryBundle,
  ) {}

  async exportLocal(): Promise<TaskFlowSnapshot> {
    await openDatabaseWithoutSeed(this.database);
    const [lists, tasks, events, syncOperations, sync] = await Promise.all([
      this.database.lists.toArray(),
      this.database.tasks.toArray(),
      this.database.taskEvents.toArray(),
      this.database.syncOperations.toArray(),
      readSyncMetadata(this.database),
    ]);
    lists.forEach(assertLocalListRecord);
    tasks.forEach(assertLocalTaskRecord);
    events.forEach(assertLocalTaskEventRecord);
    syncOperations.forEach(assertLocalSyncOperationRecord);
    return createSnapshot({
      lists: lists.map(toSnapshotList),
      tasks: tasks.map(toSnapshotTask),
      events: events.map(toSnapshotEvent),
      sync,
    });
  }

  async exportRemote(): Promise<TaskFlowSnapshot> {
    if (!this.apiRepositories) {
      throw new LocalStorageValidationError("No hay repositorios remotos configurados para exportar Cloud.");
    }
    const [lists, tasks, events, sync] = await Promise.all([
      this.apiRepositories.lists.findAll(),
      this.apiRepositories.tasks.findAll(),
      collectHistory(this.apiRepositories),
      readSyncMetadata(this.database),
    ]);
    return createSnapshot({
      lists: lists.map(snapshotListFromDomain),
      tasks: tasks.map(snapshotTaskFromDomain),
      events: events.map(snapshotEventFromDomain),
      sync: { ...sync, pending_operations: 0 },
    });
  }

  async importLocal(input: unknown): Promise<TaskFlowSnapshot> {
    const snapshot = await parseSnapshot(input);
    if (snapshot.sync.pending_operations > 0) {
      throw new LocalStorageValidationError(
        "No se puede importar un snapshot con operaciones pendientes sin sus payloads.",
      );
    }
    await openTaskFlowDatabase(this.database);
    const records = toLocalRecords(snapshot);
    await this.database.transaction(
      "rw",
      this.database.lists,
      this.database.tasks,
      this.database.taskEvents,
      this.database.syncOperations,
      this.database.appState,
      async () => {
        await this.database.lists.clear();
        await this.database.tasks.clear();
        await this.database.taskEvents.clear();
        await this.database.syncOperations.clear();
        await this.database.appState.clear();
        await this.database.lists.bulkPut(records.lists);
        await this.database.tasks.bulkPut(records.tasks);
        await this.database.taskEvents.bulkPut(records.events);
        await this.database.appState.bulkPut([
          { key: APP_STATE_KEYS.schemaVersion, value: 2 },
          { key: APP_STATE_KEYS.deviceId, value: snapshot.sync.device_id },
          { key: APP_STATE_KEYS.clientVersion, value: snapshot.sync.client_version },
          { key: APP_STATE_KEYS.syncCursor, value: snapshot.sync.cursor },
        ]);
      },
    );
    const verified = await this.exportLocal();
    await parseSnapshot(verified);
    if (!sameImportedContent(snapshot, verified)) {
      throw new LocalStorageValidationError("La verificacion posterior del snapshot no coincide.");
    }
    return verified;
  }

  async captureLocalDatabase(): Promise<LocalDatabaseBackup> {
    await openTaskFlowDatabase(this.database);
    const [lists, tasks, events, syncOperations, appState] = await Promise.all([
      this.database.lists.toArray(),
      this.database.tasks.toArray(),
      this.database.taskEvents.toArray(),
      this.database.syncOperations.toArray(),
      this.database.appState.toArray(),
    ]);
    lists.forEach(assertLocalListRecord);
    tasks.forEach(assertLocalTaskRecord);
    events.forEach(assertLocalTaskEventRecord);
    syncOperations.forEach(assertLocalSyncOperationRecord);
    return { lists, tasks, events, syncOperations, appState };
  }

  async restoreLocalDatabase(backup: LocalDatabaseBackup): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction(
      "rw",
      this.database.lists,
      this.database.tasks,
      this.database.taskEvents,
      this.database.syncOperations,
      this.database.appState,
      async () => {
        await this.database.lists.clear();
        await this.database.tasks.clear();
        await this.database.taskEvents.clear();
        await this.database.syncOperations.clear();
        await this.database.appState.clear();
        await this.database.lists.bulkPut(backup.lists);
        await this.database.tasks.bulkPut(backup.tasks);
        await this.database.taskEvents.bulkPut(backup.events);
        await this.database.syncOperations.bulkPut(backup.syncOperations);
        await this.database.appState.bulkPut(backup.appState);
      },
    );
  }

  async resetLocal(): Promise<void> {
    await openTaskFlowDatabase(this.database);
    await this.database.transaction(
      "rw",
      [
        this.database.lists,
        this.database.tasks,
        this.database.taskEvents,
        this.database.syncOperations,
        this.database.appState,
        this.database.voiceSessions,
      ],
      async () => {
        await this.database.lists.clear();
        await this.database.tasks.clear();
        await this.database.taskEvents.clear();
        await this.database.syncOperations.clear();
        await this.database.appState.clear();
        await this.database.voiceSessions.clear();
      },
    );
    await openTaskFlowDatabase(this.database);
  }

  getLocalRepository(): LocalRepository {
    return this.localRepository;
  }
}

async function openDatabaseWithoutSeed(database: TaskFlowDatabase): Promise<void> {
  if (!database.isOpen()) {
    await database.open();
  }
  const deviceId = await database.appState.get(APP_STATE_KEYS.deviceId);
  if (typeof deviceId?.value !== "string") {
    await database.appState.put({ key: APP_STATE_KEYS.deviceId, value: createUuid() });
  }
}

function sameImportedContent(left: TaskFlowSnapshot, right: TaskFlowSnapshot): boolean {
  return JSON.stringify({
    lists: left.lists,
    tasks: left.tasks,
    events: left.events,
    sync: left.sync,
    counts: left.counts,
  }) === JSON.stringify({
    lists: right.lists,
    tasks: right.tasks,
    events: right.events,
    sync: right.sync,
    counts: right.counts,
  });
}

async function collectHistory(apiRepositories: ApiRepositoryBundle): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await apiRepositories.history.findPage({ page, pageSize: 100 });
    entries.push(...result.entries);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);
  return entries;
}

async function readSyncMetadata(database: TaskFlowDatabase): Promise<{
  device_id: string;
  cursor: string | null;
  client_version: number;
  pending_operations: number;
}> {
  await openDatabaseWithoutSeed(database);
  const deviceIdRecord = await database.appState.get(APP_STATE_KEYS.deviceId);
  if (typeof deviceIdRecord?.value !== "string") {
    throw new LocalStorageValidationError("El identificador local de dispositivo no es valido.");
  }
  const [cursorRecord, versionRecord, pendingOperations] = await Promise.all([
    database.appState.get(APP_STATE_KEYS.syncCursor),
    database.appState.get(APP_STATE_KEYS.clientVersion),
    database.syncOperations.filter((record) => record.processedAt === null).count(),
  ]);
  const cursor = cursorRecord?.value;
  const clientVersion = versionRecord?.value;
  if (cursor !== null && cursor !== undefined && typeof cursor !== "string") {
    throw new LocalStorageValidationError("El cursor local de sincronizacion esta corrupto.");
  }
  if (clientVersion !== undefined
    && (typeof clientVersion !== "number" || !Number.isInteger(clientVersion) || clientVersion < 0)) {
    throw new LocalStorageValidationError("La version local de cliente no es valida.");
  }
  return {
    device_id: deviceIdRecord.value,
    cursor: cursor === undefined ? null : cursor,
    client_version: typeof clientVersion === "number" ? clientVersion : 0,
    pending_operations: pendingOperations,
  };
}

function toSnapshotList(record: LocalListRecord): SnapshotList {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    emoji: record.emoji,
    color: record.color,
    position: record.position,
    is_archived: record.isArchived,
    is_system: record.isSystem,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  };
}

function toSnapshotTask(record: LocalTaskRecord): SnapshotTask {
  return {
    id: record.id,
    list_id: record.listId,
    title: record.title,
    description: record.description,
    status: record.status,
    source: record.source,
    position: record.position,
    completed_at: record.completedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt,
  };
}

function toSnapshotEvent(record: LocalTaskEventRecord): SnapshotEvent {
  return {
    id: record.id,
    task_id: record.taskId,
    event_type: record.eventType,
    payload: record.payload,
    created_at: record.createdAt,
  };
}

function toLocalRecords(snapshot: TaskFlowSnapshot): {
  lists: LocalListRecord[];
  tasks: LocalTaskRecord[];
  events: LocalTaskEventRecord[];
} {
  const lists = snapshot.lists.map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    emoji: list.emoji,
    color: list.color,
    position: list.position,
    isArchived: list.is_archived,
    isSystem: list.is_system,
    createdAt: list.created_at,
    updatedAt: list.updated_at,
    deletedAt: list.deleted_at,
    syncClientVersion: 0,
    syncOperationId: null,
  } satisfies LocalListRecord));
  const tasks = snapshot.tasks.map((task) => ({
    id: task.id,
    listId: task.list_id,
    title: task.title,
    description: task.description,
    status: task.status,
    source: task.source,
    position: task.position,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    deletedAt: task.deleted_at,
    syncClientVersion: 0,
    syncOperationId: null,
  } satisfies LocalTaskRecord));
  const events = snapshot.events.map((event) => ({
    id: event.id,
    taskId: event.task_id,
    eventType: event.event_type,
    payload: event.payload,
    createdAt: event.created_at,
  } satisfies LocalTaskEventRecord));
  lists.forEach(assertLocalListRecord);
  tasks.forEach(assertLocalTaskRecord);
  events.forEach(assertLocalTaskEventRecord);
  return { lists, tasks, events };
}

export function assertSnapshotTaskRelations(snapshot: TaskFlowSnapshot): void {
  const listIds = new Set(snapshot.lists.map((list) => list.id));
  if (snapshot.tasks.some((task) => !listIds.has(task.list_id))) {
    throw new LocalStorageValidationError("El snapshot contiene una tarea sin lista propietaria.");
  }
}
