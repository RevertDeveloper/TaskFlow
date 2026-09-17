import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import {
  CURRENT_SCHEMA_VERSION,
  DATABASE_NAME,
  SCHEMA_V1,
} from "./schema";
import { TaskFlowDatabase, getDeviceId, openTaskFlowDatabase } from "./database";

describe("TaskFlowDatabase", () => {
  const databaseNames: string[] = [];

  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map(async (name) => {
      await Dexie.delete(name);
    }));
  });

  it("opens every store and persists schema metadata and device identity", async () => {
    const database = createDatabase();

    await openTaskFlowDatabase(database);
    const deviceId = await getDeviceId(database);

    expect(database.tables.map((table) => table.name).sort()).toEqual([
      "app_state",
      "lists",
      "sync_operations",
      "task_events",
      "tasks",
      "voice_sessions",
    ]);
    expect(await database.appState.get("schema_version")).toEqual({
      key: "schema_version",
      value: CURRENT_SCHEMA_VERSION,
    });
    expect(await database.appState.get("device_id")).toEqual({
      key: "device_id",
      value: deviceId,
    });
    expect(await getDeviceId(database)).toBe(deviceId);
  });

  it("migrates a version 1 database without deleting existing records", async () => {
    const name = createDatabaseName();
    const oldDatabase = new Dexie(name);
    oldDatabase.version(1).stores(SCHEMA_V1);
    await oldDatabase.open();
    await oldDatabase.table("lists").put({
      id: "legacy-list",
      name: "Lista antigua",
      position: 0,
      updatedAt: "2026-09-17T10:00:00.000Z",
    });
    await oldDatabase.close();

    const database = new TaskFlowDatabase(name);
    await openTaskFlowDatabase(database);

    expect(await database.lists.get("legacy-list")).toMatchObject({
      name: "Lista antigua",
      description: "",
      isArchived: false,
      isSystem: false,
      deletedAt: null,
    });
    expect(await database.syncOperations.count()).toBe(0);
    expect(await database.voiceSessions.count()).toBe(0);
    expect(await database.appState.get("schema_version")).toEqual({
      key: "schema_version",
      value: CURRENT_SCHEMA_VERSION,
    });
  });

  it("adds stores missing from a legacy schema during upgrade", async () => {
    const name = createDatabaseName();
    const legacyDatabase = new Dexie(name);
    legacyDatabase.version(1).stores({ lists: "id", app_state: "key" });
    await legacyDatabase.open();
    await legacyDatabase.table("app_state").put({ key: "custom", value: "preserved" });
    await legacyDatabase.close();

    const database = new TaskFlowDatabase(name);
    await openTaskFlowDatabase(database);

    expect(await database.appState.get("custom")).toEqual({ key: "custom", value: "preserved" });
    expect(database.tables).toHaveLength(6);
    expect(await database.syncOperations.toArray()).toEqual([]);
    expect(await database.voiceSessions.toArray()).toEqual([]);
  });
});

function createDatabase(): TaskFlowDatabase {
  return new TaskFlowDatabase(createDatabaseName());
}

function createDatabaseName(): string {
  const name = `${DATABASE_NAME}-${crypto.randomUUID()}`;
  return name;
}