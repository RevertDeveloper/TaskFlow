export type BlockType = "paragraph" | "heading" | "checklist" | "code" | "divider";

export type HighlightColor = "pink" | "purple" | "orange" | "mint" | "blue";

export type InlineFormat = {
  bold?: true;
  italic?: true;
  code?: true;
  highlight?: HighlightColor;
  link?: string;
};

export type InlineSpan = {
  text: string;
  format?: InlineFormat;
};

export type ChecklistItem = {
  id: string;
  spans: InlineSpan[];
  status: "pending" | "completed";
  completedAt: string | null;
  indentLevel: number;
  position: number;
  children: ChecklistItem[];
};

export type ParagraphBlock = { id: string; type: "paragraph"; spans: InlineSpan[] };
export type HeadingBlock = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3;
  spans: InlineSpan[];
  collapsed?: boolean;
};
export type ChecklistBlockNode = {
  id: string;
  type: "checklist";
  items: ChecklistItem[];
  autoSort: boolean;
};
export type CodeBlock = { id: string; type: "code"; language?: string; text: string };
export type DividerBlock = { id: string; type: "divider" };

export type BlockNode = ParagraphBlock | HeadingBlock | ChecklistBlockNode | CodeBlock | DividerBlock;

export type Note = {
  id: string;
  folderId: string | null;
  title: string;
  blocks: BlockNode[];
  tags: string[];
  pinned: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteDraft = {
  folderId: string | null;
  blocks?: BlockNode[];
  firstLine?: string;
};

export type NotePatch = Partial<Pick<Note, "blocks" | "folderId" | "pinned" | "tags">>;
