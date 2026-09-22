import type { Note, NoteDraft, NotePatch } from "./models";

export interface NoteRepository {
  findAll(folderId?: string | null): Promise<Note[]>;
  findById(id: string): Promise<Note | null>;
  search(query: string): Promise<Note[]>;
  create(draft: NoteDraft): Promise<Note>;
  update(id: string, patch: NotePatch): Promise<Note>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
