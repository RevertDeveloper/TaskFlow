import type { Folder, FolderDraft, FolderPatch } from "./models";

export interface FolderRepository {
  findAll(): Promise<Folder[]>;
  create(draft: FolderDraft): Promise<Folder>;
  update(id: string, patch: FolderPatch): Promise<Folder>;
  softDelete(id: string): Promise<void>;
}
