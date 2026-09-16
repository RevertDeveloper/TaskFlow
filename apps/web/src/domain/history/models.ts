export type HistoryEntry = {
  id: string;
  taskId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type HistoryPage = {
  entries: HistoryEntry[];
  page: number;
  totalPages: number;
  totalCount: number;
};