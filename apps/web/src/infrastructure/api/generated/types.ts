export type ListOutput = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  position: number;
  is_archived: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskSource = "manual" | "voice" | "ai" | "import";
export type TaskStatus = "pending" | "completed";

export type TaskOutput = {
  id: string;
  list_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  source: TaskSource;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HistoryOutput = {
  id: string;
  task_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type VoiceSessionStatus = "recording" | "uploaded" | "transcribing" | "transcribed" | "failed";

export type VoiceSessionOutput = {
  id: string;
  status: VoiceSessionStatus;
  transcript: string;
  transcript_retention: boolean;
  error_code: string;
  created_at: string;
  updated_at: string;
};

export type VoiceReviewTask = {
  title: string;
  description: string | null;
  list_id: string;
  classification_hint: "explicit" | "current" | "semantic" | "inbox" | "ambiguous";
  confidence: number;
  routing: "explicit" | "current" | "semantic" | "inbox";
};

export type VoiceReviewDraft = {
  id: string;
  session_id: string;
  status: "draft" | "confirmed" | "expired";
  schema_version: number;
  tasks: VoiceReviewTask[];
  source: Record<string, string>;
  expires_at: string;
  confirmed_task_ids: string[];
  created_at: string;
  updated_at: string;
};

export type VoiceReviewConfirmation = {
  idempotency_key: string;
  tasks: Array<Pick<VoiceReviewTask, "title" | "description" | "list_id">>;
};

export type PaginationMeta = {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: PaginationMeta;
};

export type ListCreate = {
  name: string;
  description?: string;
  emoji?: string;
  color?: string;
  position?: number;
};

export type TaskCreate = {
  list_id?: string;
  title: string;
  description?: string;
  source?: TaskSource;
  position?: number;
};

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  detail?: string;
  details?: Record<string, unknown>;
};