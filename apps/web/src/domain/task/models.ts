export type TaskStatus = "pending" | "completed";
export type TaskSource = "manual" | "voice" | "ai" | "import";

export type Task = {
  id: string;
  listId: string;
  title: string;
  description: string;
  status: TaskStatus;
  source: TaskSource;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskDraft = {
  listId: string;
  title: string;
  description?: string;
};

export type TaskPatch = Partial<Pick<TaskDraft, "title" | "description" | "listId">>;