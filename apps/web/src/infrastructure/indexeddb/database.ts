import Dexie, { type Table } from "dexie";

import { registerMigrations } from "./migrations";
import {
  APP_STATE_KEYS,
  CURRENT_SCHEMA_VERSION,
  DATABASE_NAME,
  type LocalAppStateRecord,
  type LocalListRecord,
  type LocalFolderRecord,
  type LocalNoteRecord,
  type LocalNoteTagRecord,
  type LocalSyncOperationRecord,
  type LocalTaskEventRecord,
  type LocalTaskRecord,
  type LocalVoiceSessionRecord,
  assertLocalListRecord,
  isUuid,
} from "./schema";

export class TaskFlowDatabase extends Dexie {
  lists!: Table<LocalListRecord, string>;
  tasks!: Table<LocalTaskRecord, string>;
  taskEvents!: Table<LocalTaskEventRecord, string>;
  syncOperations!: Table<LocalSyncOperationRecord, string>;
  appState!: Table<LocalAppStateRecord, string>;
  voiceSessions!: Table<LocalVoiceSessionRecord, string>;
  notes!: Table<LocalNoteRecord, string>;
  folders!: Table<LocalFolderRecord, string>;
  noteTags!: Table<LocalNoteTagRecord, number>;

  constructor(name = DATABASE_NAME) {
    super(name);
    registerMigrations(this);
    this.lists = this.table("lists");
    this.tasks = this.table("tasks");
    this.taskEvents = this.table("task_events");
    this.syncOperations = this.table("sync_operations");
    this.appState = this.table("app_state");
    this.voiceSessions = this.table("voice_sessions");
    this.notes = this.table("notes");
    this.folders = this.table("folders");
    this.noteTags = this.table("note_tags");
  }
}

export const taskFlowDatabase = new TaskFlowDatabase();

export async function openTaskFlowDatabase(database = taskFlowDatabase): Promise<TaskFlowDatabase> {
  if (!database.isOpen()) {
    await database.open();
  }
  await database.transaction("rw", database.appState, database.lists, async () => {
    const schemaVersion = await database.appState.get(APP_STATE_KEYS.schemaVersion);
    if (schemaVersion?.value !== CURRENT_SCHEMA_VERSION) {
      await database.appState.put({
        key: APP_STATE_KEYS.schemaVersion,
        value: CURRENT_SCHEMA_VERSION,
      });
    }
    const lists = await database.lists.toArray();
    lists.forEach(assertLocalListRecord);
    if (!lists.some((list) => list.isSystem && list.deletedAt === null)) {
      const now = new Date().toISOString();
      await database.lists.add({
        id: createUuid(),
        name: "Inbox",
        description: "",
        emoji: "",
        color: "",
        position: 0,
        isArchived: false,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
  });
  return database;
}

export async function getDeviceId(database = taskFlowDatabase): Promise<string> {
  await openTaskFlowDatabase(database);
  const existing = await database.appState.get(APP_STATE_KEYS.deviceId);
  if (typeof existing?.value === "string" && isUuid(existing.value)) {
    return existing.value;
  }

  const generated = createUuid();
  return database.transaction("rw", database.appState, async () => {
    const current = await database.appState.get(APP_STATE_KEYS.deviceId);
    if (typeof current?.value === "string" && isUuid(current.value)) {
      return current.value;
    }
    await database.appState.put({ key: APP_STATE_KEYS.deviceId, value: generated });
    return generated;
  });
}

export function createUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("El navegador no ofrece una fuente criptográfica para generar UUID.");
}