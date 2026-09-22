import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createUuid, TaskFlowDatabase, openTaskFlowDatabase } from "./database";
import { IndexedDbFolderRepository } from "./IndexedDbFolderRepository";

const names: string[] = [];

describe("IndexedDbFolderRepository", () => {
  afterEach(async () => { await Promise.all(names.splice(0).map((name) => Dexie.delete(name))); });

  it("persists nested folders and queues folder operations", async () => {
    const database = new TaskFlowDatabase(`taskflow-folders-${crypto.randomUUID()}`);
    names.push(database.name);
    await openTaskFlowDatabase(database);
    const repository = new IndexedDbFolderRepository(database);
    const parent = await repository.create({ name: "Personal", parentId: null, emoji: "" });
    const child = await repository.create({ name: "Diario", parentId: parent.id, emoji: "" });

    expect(await repository.findAll()).toEqual(expect.arrayContaining([parent, child]));
    expect((await database.syncOperations.where("entityType").equals("folder").toArray())).toHaveLength(2);
    await repository.softDelete(child.id);
    expect((await repository.findAll()).map((folder) => folder.id)).toEqual([parent.id]);
  });

  it("keeps the folder contract UUID based", () => {
    expect(createUuid()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
