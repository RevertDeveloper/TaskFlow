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

  it("applies normalized note folder fields and remote tombstones", async () => {
    const database = new TaskFlowDatabase(`taskflow-replica-${crypto.randomUUID()}`);
    databaseNames.push(database.name);
    await openTaskFlowDatabase(database);
    const noteId = createUuid();
    const folderId = createUuid();
    const replica = new LocalReplica(database);
    const updatedAt = "2026-09-17T10:01:00Z";
    const note: SyncChange = {
      entityType: "note",
      entityId: noteId,
      operation: "upsert",
      updatedAt,
      clientVersion: 1,
      operationId: createUuid(),
      data: {
        id: noteId,
        folderId,
        title: "Nota",
        blocks: [],
        tags: [],
        pinned: false,
        archivedAt: null,
        deletedAt: null,
        createdAt: updatedAt,
      },
    };

    await replica.applyChanges([note]);
    await expect(database.notes.get(noteId)).resolves.toMatchObject({ folderId, deletedAt: null });

    const deletedAt = "2026-09-17T10:02:00Z";
    await replica.applyChanges([{ ...note, operation: "delete", updatedAt: deletedAt, data: { ...note.data, deletedAt } }]);
    await expect(database.notes.get(noteId)).resolves.toMatchObject({ deletedAt });
  });

  it("stores remote folders for cross-device moves", async () => {
    const database = new TaskFlowDatabase(`taskflow-replica-${crypto.randomUUID()}`);
    databaseNames.push(database.name);
    await openTaskFlowDatabase(database);
    const folderId = createUuid();
    const replica = new LocalReplica(database);
    const updatedAt = "2026-09-17T10:01:00Z";

    const folderChange: SyncChange = {
      entityType: "folder",
      entityId: folderId,
      operation: "upsert",
      updatedAt,
      clientVersion: 1,
      operationId: createUuid(),
      data: { id: folderId, parentId: null, name: "Trabajo", position: 0, createdAt: updatedAt, deletedAt: null },
    };
    await replica.applyChanges([folderChange]);

    await expect(database.folders.get(folderId)).resolves.toMatchObject({ id: folderId, name: "Trabajo", deletedAt: null });
    await database.folders.update(folderId, { emoji: "📁" });
    await replica.applyChanges([{ ...folderChange, updatedAt: "2026-09-17T10:02:00Z", data: { ...folderChange.data, name: "Trabajo actualizado" } }]);
    await expect(database.folders.get(folderId)).resolves.toMatchObject({ name: "Trabajo actualizado", emoji: "📁" });
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
      clientVersion: 1,
      operationId: operation === "delete"
        ? "00000000-0000-4000-8000-000000000002"
        : "00000000-0000-4000-8000-000000000001",
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