import type { BlockNode, ChecklistItem, InlineSpan, Note, NoteDraft, NotePatch } from "@/domain/note/models";
import type { NoteRepository } from "@/domain/note/ports";

import { createUuid, getDeviceId, openTaskFlowDatabase, taskFlowDatabase, type TaskFlowDatabase } from "./database";
import { LocalStorageError, LocalStorageValidationError } from "./errors";
import { assertLocalNoteRecord, type JsonObject, type LocalNoteRecord } from "./schema";

export class IndexedDbNoteRepository implements NoteRepository {
  constructor(private readonly database: TaskFlowDatabase = taskFlowDatabase) {}

  async findAll(folderId?: string | null): Promise<Note[]> {
    await openTaskFlowDatabase(this.database);
    const records = folderId === undefined
      ? await this.database.notes.orderBy("updatedAt").reverse().toArray()
      : await this.database.notes.toCollection()
        .filter((record) => record.folderId === folderId)
        .sortBy("updatedAt");
    return records.reverse().flatMap((record) => {
      assertLocalNoteRecord(record);
      return record.deletedAt === null ? [toNote(record)] : [];
    });
  }

  async findById(id: string): Promise<Note | null> {
    await openTaskFlowDatabase(this.database);
    const record = await this.database.notes.get(id);
    if (!record) return null;
    assertLocalNoteRecord(record);
    return record.deletedAt === null ? toNote(record) : null;
  }

  async search(query: string): Promise<Note[]> {
    const normalized = query.trim().toLowerCase();
    const notes = await this.findAll();
    if (!normalized) return notes;
    return notes
      .filter((note) => buildSearchIndex(note).includes(normalized))
      .sort((left, right) => scoreNote(right, normalized) - scoreNote(left, normalized));
  }

  async create(draft: NoteDraft): Promise<Note> {
    await openTaskFlowDatabase(this.database);
    const now = new Date().toISOString();
    const note = createNote(draft, now);
    const storedNote = toNote(toRecord(note));
    await this.database.notes.add(toRecord(storedNote));
    await enqueueSync(this.database, storedNote.id, "create", {
      entityId: storedNote.id,
      title: storedNote.title,
      blocks: storedNote.blocks,
      folderId: storedNote.folderId,
      pinned: storedNote.pinned,
    });
    notifyLocalChange();
    return storedNote;
  }

  async update(id: string, patch: NotePatch): Promise<Note> {
    await openTaskFlowDatabase(this.database);
    const current = await getNoteRecord(this.database, id);
    const nextBlocks = patch.blocks === undefined ? current.blocks : normalizeBlocks(patch.blocks);
    const next: Note = {
      ...toNote(current),
      blocks: nextBlocks,
      title: deriveNoteTitle(nextBlocks),
      folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
      pinned: patch.pinned === undefined ? current.pinned : patch.pinned,
      tags: patch.tags === undefined ? current.tags : [...new Set(patch.tags)],
      updatedAt: new Date().toISOString(),
    };
    const storedNote = toNote(toRecord(next));
    await this.database.notes.put(toRecord(storedNote));
    await enqueueSync(this.database, id, "update", { entityId: id, ...patch, tags: storedNote.tags });
    notifyLocalChange();
    return storedNote;
  }

  async softDelete(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const current = await getNoteRecord(this.database, id);
    const deletedAt = new Date().toISOString();
    await this.database.notes.put({ ...current, deletedAt, updatedAt: deletedAt });
    await enqueueSync(this.database, id, "delete", { entityId: id });
    notifyLocalChange();
  }

  async restore(id: string): Promise<void> {
    await openTaskFlowDatabase(this.database);
    const current = await getNoteRecord(this.database, id);
    await this.database.notes.put({ ...current, deletedAt: null, updatedAt: new Date().toISOString() });
    notifyLocalChange();
  }
}

function notifyLocalChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("taskflow:local-change", { detail: "note" }));
}

export function buildSearchIndex(note: Note): string {
  const body = note.blocks.map(extractBlockText).join(" ");
  return `${note.title} ${body} ${note.tags.join(" ")}`.toLowerCase();
}

export function scoreNote(note: Note, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const title = note.title.toLowerCase();
  const body = note.blocks.map(extractBlockText).join(" ").replace(/#[\w\u00c0-\u024f-]+/gu, "").toLowerCase();
  const tagText = note.tags.join(" ").toLowerCase();
  let score = 0;
  if (title.startsWith(normalized)) score += 10;
  if (title.includes(normalized)) score += 5;
  score += Math.min(body.split(normalized).length - 1, 5) * 3;
  if (tagText.includes(normalized)) score += 1;
  return score;
}

export function extractTags(blocks: BlockNode[]): string[] {
  const text = blocks.map(extractBlockText).join(" ");
  const tags = new Set<string>();
  const matcher = /(^|[^\w#])#([\w\u00c0-\u024f-]+)/gu;
  for (const match of text.matchAll(matcher)) tags.add(match[2].toLowerCase());
  return [...tags].sort();
}

export function deriveNoteTitle(blocks: BlockNode[], firstLine = ""): string {
  const heading = blocks.find((block) => block.type === "heading" && extractSpans(block.spans).trim());
  if (heading?.type === "heading") return extractSpans(heading.spans).trim().slice(0, 500);
  const paragraph = blocks.find((block) => block.type === "paragraph" && extractSpans(block.spans).trim());
  if (paragraph?.type === "paragraph") return extractSpans(paragraph.spans).trim().slice(0, 500);
  return firstLine.trim().slice(0, 500);
}

export function normalizeBlocks(blocks: BlockNode[]): BlockNode[] {
  if (blocks.length > 2000) {
    throw new LocalStorageValidationError("Una nota no puede contener más de 2000 bloques.");
  }
  return blocks.map((block) => block.type === "checklist"
    ? { ...block, items: block.items.map(normalizeChecklistItem) }
    : block);
}

function normalizeChecklistItem(item: ChecklistItem): ChecklistItem {
  return {
    ...item,
    indentLevel: Math.max(0, Math.min(4, item.indentLevel)),
    children: item.children.map(normalizeChecklistItem),
  };
}

function createNote(draft: NoteDraft, now: string): Note {
  const blocks = normalizeBlocks(draft.blocks ?? createInitialBlocks(draft.firstLine));
  return {
    id: createUuid(),
    folderId: draft.folderId,
    title: deriveNoteTitle(blocks, draft.firstLine),
    blocks,
    tags: [],
    pinned: false,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createInitialBlocks(firstLine?: string): BlockNode[] {
  return [{ id: createUuid(), type: "paragraph", spans: [{ text: firstLine ?? "" }] }];
}

function toRecord(note: Note): LocalNoteRecord {
  const blocks = normalizeBlocks(note.blocks);
  const normalizedNote = { ...note, blocks, tags: extractTags(blocks) };
  return { ...normalizedNote, searchIndex: buildSearchIndex(normalizedNote) };
}

function toNote(record: LocalNoteRecord): Note {
  return {
    id: record.id,
    folderId: record.folderId,
    title: record.title,
    blocks: record.blocks,
    tags: record.tags,
    pinned: record.pinned,
    archivedAt: record.archivedAt,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function getNoteRecord(database: TaskFlowDatabase, id: string): Promise<LocalNoteRecord> {
  const record = await database.notes.get(id);
  if (!record) throw new LocalStorageError("unknown", "La nota solicitada no existe en el dispositivo.");
  assertLocalNoteRecord(record);
  return record;
}

function extractBlockText(block: BlockNode): string {
  if (block.type === "code") return block.text;
  if (block.type === "divider") return "";
  if (block.type === "checklist") return block.items.map(extractChecklistText).join(" ");
  return extractSpans(block.spans);
}

function extractChecklistText(item: ChecklistItem): string {
  return `${extractSpans(item.spans)} ${item.children.map(extractChecklistText).join(" ")}`;
}

function extractSpans(spans: InlineSpan[]): string {
  return spans.map((span) => span.text).join("");
}

async function enqueueSync(
  database: TaskFlowDatabase,
  entityId: string,
  operation: "create" | "update" | "delete",
  payload: Record<string, unknown>,
): Promise<void> {
  const deviceId = await getDeviceId(database);
  const currentVersion = await database.appState.get("client_version");
  const clientVersion = typeof currentVersion?.value === "number" ? currentVersion.value + 1 : 1;
  await database.appState.put({ key: "client_version", value: clientVersion });
  const operationId = createUuid();
  await database.syncOperations.add({
    id: operationId,
    deviceId,
    entityType: "note",
    entityId,
    operation,
    clientVersion,
    occurredAt: new Date().toISOString(),
    processedAt: null,
    idempotencyKey: createUuid(),
    payloadVersion: 1,
    payload: JSON.parse(JSON.stringify(payload)) as JsonObject,
  });
}
