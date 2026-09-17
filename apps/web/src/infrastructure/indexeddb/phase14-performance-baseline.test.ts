import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { IndexedDbHistoryRepository } from "./IndexedDbHistoryRepository";
import { IndexedDbSyncRepository } from "./IndexedDbSyncRepository";
import { createUuid, openTaskFlowDatabase, TaskFlowDatabase } from "./database";
import { type LocalSyncOperationRecord, type LocalTaskEventRecord, type LocalTaskRecord } from "./schema";
import { IndexedDbTaskRepository } from "./IndexedDbTaskRepository";

const databaseNames: string[] = [];
const representativeTasks = 1_000;
const representativeEvents = 5_000;
const representativeSyncOperations = 500;

describe("Phase 14 performance baseline", () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("records representative IndexedDB timings", async () => {
    const database = await createDatabase();
    const list = (await database.lists.toArray()).find((record) => record.isSystem);
    if (!list) {
      throw new Error("No se encontró la lista Inbox del baseline.");
    }
    const taskIds = Array.from({ length: representativeTasks }, () => createUuid());
    await seedDatabase(database, list.id, taskIds);

    const history = new IndexedDbHistoryRepository(database);
    const sync = new IndexedDbSyncRepository(database);
    const tasks = new IndexedDbTaskRepository(database);
    const firstHistoryMeasurement = await measure(() => history.findPage({ page: 1, pageSize: 100 }));
    const deepHistoryMeasurement = await measure(() => history.findPage({ page: 50, pageSize: 100 }));
    const syncMeasurement = await measure(() => sync.findPending(representativeSyncOperations));
    const crudMeasurement = await measureCrud(tasks, list.id);

    database.close();
    const coldDatabase = new TaskFlowDatabase(database.name);
    const coldStartMeasurement = await measure(() => openTaskFlowDatabase(coldDatabase));
    coldDatabase.close();

    expect(firstHistoryMeasurement.value.totalCount).toBe(representativeEvents);
    expect(firstHistoryMeasurement.value.entries).toHaveLength(100);
    expect(deepHistoryMeasurement.value.totalCount).toBe(representativeEvents);
    expect(deepHistoryMeasurement.value.entries).toHaveLength(100);
    expect(syncMeasurement.value).toHaveLength(representativeSyncOperations);
    expect(crudMeasurement.operations).toBe(80);

    console.info(
      "PHASE14_INDEXEDDB_BASELINE",
      JSON.stringify({
        volume: {
          tasks: representativeTasks,
          events: representativeEvents,
          pending_sync_operations: representativeSyncOperations,
        },
        cold_start_ms: coldStartMeasurement.durationMs,
        history_first_page_ms: firstHistoryMeasurement.durationMs,
        history_deep_page_ms: deepHistoryMeasurement.durationMs,
        history_total_count: firstHistoryMeasurement.value.totalCount,
        sync_batch_ms: syncMeasurement.durationMs,
        sync_batch_count: syncMeasurement.value.length,
        crud_ms: crudMeasurement.durationMs,
        crud_operations: crudMeasurement.operations,
      }),
    );
  });
});

async function createDatabase(): Promise<TaskFlowDatabase> {
  const database = new TaskFlowDatabase(`taskflow-phase14-${crypto.randomUUID()}`);
  databaseNames.push(database.name);
  await openTaskFlowDatabase(database);
  return database;
}

async function seedDatabase(database: TaskFlowDatabase, listId: string, taskIds: string[]): Promise<void> {
  const now = new Date("2026-09-17T10:00:00.000Z");
  const tasks: LocalTaskRecord[] = taskIds.map((id, index) => ({
    id,
    listId,
    title: `Tarea ${index}`,
    description: "",
    status: "pending",
    source: "manual",
    position: index,
    completedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  }));
  const events: LocalTaskEventRecord[] = Array.from({ length: representativeEvents }, (_, index) => ({
    id: createUuid(),
    taskId: taskIds[index % taskIds.length],
    eventType: "TASK_UPDATED",
    payload: { index },
    createdAt: new Date(now.getTime() + index).toISOString(),
  }));
  const syncOperations: LocalSyncOperationRecord[] = Array.from(
    { length: representativeSyncOperations },
    (_, index) => ({
      id: createUuid(),
      deviceId: createUuid(),
      entityType: "task",
      entityId: taskIds[index % taskIds.length],
      operation: "update",
      clientVersion: index + 1,
      occurredAt: new Date(now.getTime() + index).toISOString(),
      processedAt: null,
      idempotencyKey: createUuid(),
      payloadVersion: 1,
      payload: { entityId: taskIds[index % taskIds.length], title: `Tarea ${index}` },
    }),
  );
  await database.tasks.bulkAdd(tasks);
  await database.taskEvents.bulkAdd(events);
  await database.syncOperations.bulkAdd(syncOperations);
}

async function measure<Result>(operation: () => Promise<Result>): Promise<{ durationMs: number; value: Result }> {
  const startedAt = performance.now();
  const value = await operation();
  return { durationMs: Number((performance.now() - startedAt).toFixed(2)), value };
}

async function measureCrud(
  repository: IndexedDbTaskRepository,
  listId: string,
): Promise<{ durationMs: number; operations: number }> {
  const startedAt = performance.now();
  const created = [];
  for (let index = 0; index < 20; index += 1) {
    created.push(await repository.create({ listId, title: `CRUD ${index}` }));
  }
  for (const task of created) {
    await repository.update(task.id, { title: `${task.title} actualizado` });
    await repository.complete(task.id);
  }
  for (const task of created) {
    await repository.delete(task.id);
  }
  return {
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    operations: created.length * 4,
  };
}
