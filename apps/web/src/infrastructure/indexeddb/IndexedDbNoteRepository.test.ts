import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createUuid, TaskFlowDatabase, openTaskFlowDatabase } from "./database";
import { extractTags, IndexedDbNoteRepository, scoreNote } from "./IndexedDbNoteRepository";

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

  it("derives unique tags from note text and keeps them searchable", async () => {
    const database = await createDatabase();
    const repository = new IndexedDbNoteRepository(database);
    const blocks = [{ id: createUuid(), type: "paragraph" as const, spans: [{ text: "Ideas #Trabajo #trabajo y #café" }] }];
    expect(extractTags(blocks)).toEqual(["café", "trabajo"]);
    const note = await repository.create({ folderId: null, blocks });
    expect(note.tags).toEqual(["café", "trabajo"]);
    expect((await repository.search("café"))[0]?.id).toBe(note.id);
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

  it("orders matching notes by title, then body and tags", async () => {
    const database = await createDatabase();
    const repository = new IndexedDbNoteRepository(database);
    const titleMatch = await repository.create({ folderId: null, firstLine: "Project launch" });
    const bodyMatch = await repository.create({ folderId: null, blocks: [
      { id: createUuid(), type: "heading", level: 1, spans: [{ text: "Meeting" }] },
      { id: createUuid(), type: "paragraph", spans: [{ text: "Project notes" }] },
    ] });
    const tagMatch = await repository.create({ folderId: null, blocks: [
      { id: createUuid(), type: "heading", level: 1, spans: [{ text: "Archive" }] },
      { id: createUuid(), type: "paragraph", spans: [{ text: "#project" }] },
    ] });
    expect(scoreNote(titleMatch, "project")).toBeGreaterThan(scoreNote(bodyMatch, "project"));
    expect(scoreNote(bodyMatch, "project")).toBeGreaterThan(scoreNote(tagMatch, "project"));
    expect((await repository.search("project")).map((note) => note.id)).toEqual([titleMatch.id, bodyMatch.id, tagMatch.id]);
  });
});

async function createDatabase(): Promise<TaskFlowDatabase> {
  const database = new TaskFlowDatabase(`taskflow-notes-${crypto.randomUUID()}`);
  names.push(database.name);
  await openTaskFlowDatabase(database);
  return database;
}
