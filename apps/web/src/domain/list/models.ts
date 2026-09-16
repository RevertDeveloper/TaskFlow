export type TaskList = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  position: number;
  isArchived: boolean;
  isSystem: boolean;
};

export type ListDraft = {
  name: string;
  description?: string;
  emoji?: string;
  color?: string;
};

export type ListPatch = Partial<ListDraft> & {
  isArchived?: boolean;
};