import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createUuid, TaskFlowDatabase, openTaskFlowDatabase } from "./database";
import { IndexedDbNoteRepository } from "./IndexedDbNoteRepository";

const names: string[] = [];

describe("IndexedDbNoteRepository", () => {
  afterEach(async () => {
    await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
  });

  it("creates, searches and updates structured notes locally", async () => {
    const database = await createDatabase();
    const repository = new IndexedDbNoteRepository(database);
    const note = await repository.create({
      folderId: null,
      blocks: [{ id: createUuid(), type: "heading", level: 1, spans: [{ text: "Plan" }] }],
    });

    expect(note.title).toBe("Plan");
    expect((await repository.search("plan"))[0]?.id).toBe(note.id);
    expect((await repository.update(note.id, { pinned: true })).pinned).toBe(true);
    await repository.softDelete(note.id);
    expect(await repository.findById(note.id)).toBeNull();
    await repository.restore(note.id);
    expect(await repository.findById(note.id)).toMatchObject({ id: note.id, pinned: true });
  });

  it("normalizes nested checklist indentation before persistence", async () => {
    const database = await createDatabase();
    const repository = new IndexedDbNoteRepository(database);
    const note = await repository.create({
      folderId: null,
      blocks: [{
        id: createUuid(), type: "checklist", autoSort: true, items: [{
          id: createUuid(), spans: [{ text: "Nested" }], status: "pending", completedAt: null,
          indentLevel: 99, position: 0, children: [],
        }],
      }],
    });
    const stored = await database.notes.get(note.id);
    expect(stored && stored.blocks[0].type === "checklist" && stored.blocks[0].items[0].indentLevel).toBe(4);
  });
});

async function createDatabase(): Promise<TaskFlowDatabase> {
  const database = new TaskFlowDatabase(`taskflow-notes-${crypto.randomUUID()}`);
  names.push(database.name);
  await openTaskFlowDatabase(database);
  return database;
}
