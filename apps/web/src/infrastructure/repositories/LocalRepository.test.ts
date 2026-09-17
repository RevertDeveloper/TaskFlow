import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createUuid, openTaskFlowDatabase, TaskFlowDatabase } from "../indexeddb/database";
import { LocalStorageQuotaError, LocalStorageTransactionError } from "../indexeddb/errors";
import { LocalRepository } from "./LocalRepository";

const databaseNames: string[] = [];

describe("LocalRepository", () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("commits entity, event, sync operation and client version atomically", async () => {
    const database = await createDatabase();
    const repository = new LocalRepository({ database });

    const list = await repository.lists.create({ name: "Trabajo" });
    const task = await repository.tasks.create({ listId: list.id, title: "Preparar entrega" });

    expect(await repository.lists.findAll()).toEqual([list]);
    expect(await repository.tasks.findAll()).toEqual([task]);
    expect(await database.taskEvents.count()).toBe(2);
    expect(await database.syncOperations.count()).toBe(2);
    expect(await database.appState.get("client_version")).toEqual({ key: "client_version", value: 2 });
    expect(new Set((await database.syncOperations.toArray()).map((operation) => operation.idempotencyKey)).size).toBe(2);
  });

  it("replays a committed operation after an interrupted commit without duplicates", async () => {
    const database = await createDatabase();
    let runnerCalls = 0;
    const repository = new LocalRepository({
      database,
      transactionRunner: async (work) => {
        const result = await work();
        runnerCalls += 1;
        if (runnerCalls === 1) {
          throw new DOMException("La pestaña se cerró después del commit.", "AbortError");
        }
        return result;
      },
    });
    const idempotencyKey = createUuid();

    const list = await repository.createList({ name: "Reintento" }, { idempotencyKey });
    const replay = await repository.createList({ name: "Reintento" }, { idempotencyKey });

    expect(replay).toEqual(list);
    expect(runnerCalls).toBe(3);
    expect(await database.lists.count()).toBe(1);
    expect(await database.taskEvents.count()).toBe(1);
    expect(await database.syncOperations.count()).toBe(1);
  });

  it("rolls back a transaction interrupted before commit", async () => {
    const database = await createDatabase();
    let runnerCalls = 0;
    const repository = new LocalRepository({
      database,
      maxAttempts: 2,
      transactionRunner: async () => {
        runnerCalls += 1;
        throw new DOMException("Commit abortado", "AbortError");
      },
    });

    await expect(repository.createList({ name: "No guardar" })).rejects.toBeInstanceOf(LocalStorageTransactionError);
    expect(runnerCalls).toBe(2);
    expect(await database.lists.count()).toBe(0);
    expect(await database.taskEvents.count()).toBe(0);
    expect(await database.syncOperations.count()).toBe(0);
  });

  it("does not retry quota failures", async () => {
    const database = await createDatabase();
    let runnerCalls = 0;
    const repository = new LocalRepository({
      database,
      transactionRunner: async () => {
        runnerCalls += 1;
        throw new DOMException("Sin espacio", "QuotaExceededError");
      },
    });

    await expect(repository.createList({ name: "Sin espacio" })).rejects.toBeInstanceOf(LocalStorageQuotaError);
    expect(runnerCalls).toBe(1);
    expect(await database.lists.count()).toBe(0);
  });
});

async function createDatabase(): Promise<TaskFlowDatabase> {
  const database = new TaskFlowDatabase(`taskflow-local-repository-${crypto.randomUUID()}`);
  databaseNames.push(database.name);
  await openTaskFlowDatabase(database);
  return database;
}