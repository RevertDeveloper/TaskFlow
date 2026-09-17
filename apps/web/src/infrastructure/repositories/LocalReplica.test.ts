import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createUuid, openTaskFlowDatabase, TaskFlowDatabase } from "@/infrastructure/indexeddb/database";
import type { SyncChange } from "@/domain/sync/models";
import { LocalReplica } from "./LocalReplica";

const databaseNames: string[] = [];

describe("LocalReplica sync reconciliation", () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("keeps a newer tombstone when an older upsert arrives later", async () => {
    const database = new TaskFlowDatabase(`taskflow-replica-${crypto.randomUUID()}`);
    databaseNames.push(database.name);
    await openTaskFlowDatabase(database);
    const listId = createUuid();
    const replica = new LocalReplica(database);
    const deleted = listChange(listId, "2026-09-17T10:02:00Z", "delete");
    const oldUpdate = listChange(listId, "2026-09-17T10:01:00Z", "upsert");

    expect(await replica.applyChanges([deleted])).toEqual([]);
    expect(await replica.applyChanges([oldUpdate])).toEqual([
      { entityType: "list", entityId: listId, resolution: "local" },
    ]);
    await expect(database.lists.get(listId)).resolves.toMatchObject({
      updatedAt: "2026-09-17T10:02:00Z",
      deletedAt: "2026-09-17T10:02:00Z",
    });
  });
});

function listChange(
  id: string,
  updatedAt: string,
  operation: SyncChange["operation"],
): SyncChange {
  return {
    entityType: "list",
    entityId: id,
    operation,
    updatedAt,
    data: {
      id,
      name: "Trabajo",
      description: "",
      emoji: "",
      color: "",
      position: 0,
      isArchived: false,
      isSystem: false,
      createdAt: "2026-09-17T10:00:00Z",
      updatedAt,
      deletedAt: operation === "delete" ? updatedAt : null,
    },
  };
}