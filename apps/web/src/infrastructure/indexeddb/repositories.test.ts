import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createUuid, TaskFlowDatabase, openTaskFlowDatabase } from "./database";
import { IndexedDbHistoryRepository } from "./IndexedDbHistoryRepository";
import { IndexedDbListRepository } from "./IndexedDbListRepository";
import { IndexedDbSyncRepository } from "./IndexedDbSyncRepository";
import { IndexedDbTaskRepository } from "./IndexedDbTaskRepository";

const databaseNames: string[] = [];

describe("IndexedDB repositories", () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("persists list and task CRUD while hiding soft-deleted records", async () => {
    const database = await createDatabase();
    const lists = new IndexedDbListRepository(database);
    const tasks = new IndexedDbTaskRepository(database);
    const list = await lists.create({ name: "Trabajo" });
    const task = await tasks.create({ listId: list.id, title: "Preparar entrega" });

    expect(await lists.findAll()).toEqual(expect.arrayContaining([list]));
    expect((await lists.findAll()).filter((candidate) => candidate.isSystem)).toHaveLength(1);
    expect(await tasks.update(task.id, { title: "Preparar entrega final" })).toMatchObject({
      title: "Preparar entrega final",
    });
    expect((await tasks.complete(task.id)).status).toBe("completed");
    expect((await tasks.reopen(task.id)).completedAt).toBeNull();

    await tasks.delete(task.id);
    await lists.delete(list.id);

    expect(await tasks.findAll()).toEqual([]);
    expect((await lists.findAll()).find((candidate) => candidate.id === list.id)).toBeUndefined();
  });

  it("reads paginated history and pending sync operations through their ports", async () => {
    const database = await createDatabase();
    const taskId = createUuid();
    const deviceId = createUuid();
    const eventId = createUuid();
    const operationId = createUuid();
    const idempotencyKey = createUuid();
    await database.taskEvents.add({
      id: eventId,
      taskId,
      eventType: "TASK_CREATED",
      payload: { title: "Preparar entrega" },
      createdAt: "2026-09-17T10:00:00.000Z",
    });
    await database.syncOperations.add({
      id: operationId,
      deviceId,
      entityType: "task",
      entityId: taskId,
      operation: "create",
      clientVersion: 1,
      occurredAt: "2026-09-17T10:00:00.000Z",
      processedAt: null,
      idempotencyKey,
      payloadVersion: 1,
      payload: { title: "Preparar entrega" },
    });

    const history = new IndexedDbHistoryRepository(database);
    const sync = new IndexedDbSyncRepository(database);
    expect(await history.findPage({ pageSize: 1 })).toMatchObject({
      totalCount: 1,
      entries: [{ id: eventId }],
    });
    expect((await sync.findPending())[0]).toMatchObject({ id: operationId, idempotencyKey });
    await sync.markProcessed(operationId, "2026-09-17T10:01:00.000Z");
    expect(await sync.findPending()).toEqual([]);
  });

  it("rejects corrupted records instead of returning untrusted data", async () => {
    const database = await createDatabase();
    await database.syncOperations.add({
      id: createUuid(),
      deviceId: createUuid(),
      entityType: "task",
      entityId: createUuid(),
      operation: "create",
      clientVersion: 1,
      occurredAt: "2026-09-17T10:00:00.000Z",
      processedAt: null,
      idempotencyKey: createUuid(),
      payloadVersion: 1,
      payload: "corrupted" as never,
    });

    await expect(new IndexedDbSyncRepository(database).findPending()).rejects.toThrow(
      "registro local de sincronización no es válido",
    );
  });
});

async function createDatabase(): Promise<TaskFlowDatabase> {
  const database = new TaskFlowDatabase(`taskflow-repositories-${crypto.randomUUID()}`);
  databaseNames.push(database.name);
  await openTaskFlowDatabase(database);
  return database;
}