export type Folder = {
  id: string;
  parentId: string | null;
  name: string;
  emoji: string;
  position: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FolderDraft = Pick<Folder, "name" | "parentId" | "emoji">;
export type FolderPatch = Partial<Pick<Folder, "name" | "emoji" | "parentId" | "position">>;
