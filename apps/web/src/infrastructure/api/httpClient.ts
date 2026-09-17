import type {
  ApiEnvelope,
  ApiErrorPayload,
  HistoryOutput,
  ListCreate,
  ListOutput,
  TaskCreate,
  TaskOutput,
  VoiceReviewConfirmation,
  VoiceReviewDraft,
  VoiceSessionOutput,
} from "./generated/types";

const csrfCookieName = "taskflowcsrftoken";
const defaultTimeoutMs = 8_000;

export class TaskFlowApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, payload: ApiErrorPayload = {}) {
    super(payload.message ?? payload.detail ?? "No se pudo completar la operación.");
    this.name = "TaskFlowApiError";
    this.status = status;
    this.code = payload.code ?? "request_failed";
    this.details = payload.details;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
};

export class TaskFlowHttpClient {
  constructor(
    private readonly baseUrl = "",
    private readonly timeoutMs = defaultTimeoutMs,
    private readonly request: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, { ...options, method: "GET" });
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, { ...options, body, method: "POST" });
  }

  async postForm<T>(path: string, body: FormData, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, { ...options, body, method: "POST" });
  }

  async patch<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, { ...options, body, method: "PATCH" });
  }

  async delete(path: string, options: RequestOptions = {}): Promise<void> {
    await this.send<undefined>(path, { ...options, method: "DELETE" });
  }

  private async send<T>(path: string, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    const externalSignal = options.signal;
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) {
        abortFromExternalSignal();
      } else {
        externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
      }
    }
    const headers = new Headers(options.headers);
    const method = options.method?.toUpperCase() ?? "GET";
    const isMultipart = typeof FormData !== "undefined" && options.body instanceof FormData;
    headers.set("Accept", "application/json");
    headers.set("X-Request-ID", createRequestId());

    if (options.body !== undefined && !isMultipart) {
      headers.set("Content-Type", "application/json");
    }
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      headers.set("X-CSRFToken", await getCsrfToken(this.request));
    }

    try {
      const response = await this.request(`${this.baseUrl}${path}`, {
        ...options,
        body: isMultipart
          ? options.body as FormData
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
        credentials: "include",
        cache: "no-store",
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new TaskFlowApiError(response.status, await readErrorPayload(response));
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TaskFlowApiError(408, { code: "request_timeout", message: "La petición ha tardado demasiado." });
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }
}

export const taskFlowApi = new TaskFlowHttpClient();

export const api = {
  lists: (query = "") => taskFlowApi.get<ApiEnvelope<ListOutput[]>>(`/api/v1/lists/${query}`),
  tasks: (query = "") => taskFlowApi.get<ApiEnvelope<TaskOutput[]>>(`/api/v1/tasks/${query}`),
  history: (query = "") => taskFlowApi.get<ApiEnvelope<HistoryOutput[]>>(`/api/v1/history/${query}`),
  listHistory: (listId: string, query = "") =>
    taskFlowApi.get<ApiEnvelope<HistoryOutput[]>>(`/api/v1/lists/${listId}/history/${query}`),
  createList: (input: ListCreate) => taskFlowApi.post<ApiEnvelope<ListOutput>>("/api/v1/lists/", input),
  updateList: (id: string, input: Partial<ListCreate> & { is_archived?: boolean }) =>
    taskFlowApi.patch<ApiEnvelope<ListOutput>>(`/api/v1/lists/${id}/`, input),
  deleteList: (id: string) => taskFlowApi.delete(`/api/v1/lists/${id}/`),
  createTask: (input: TaskCreate) => taskFlowApi.post<ApiEnvelope<TaskOutput>>("/api/v1/tasks/", input),
  updateTask: (id: string, input: Partial<TaskCreate>) =>
    taskFlowApi.patch<ApiEnvelope<TaskOutput>>(`/api/v1/tasks/${id}/`, input),
  completeTask: (id: string) => taskFlowApi.post<ApiEnvelope<TaskOutput>>(`/api/v1/tasks/${id}/complete/`, {}),
  reopenTask: (id: string) => taskFlowApi.post<ApiEnvelope<TaskOutput>>(`/api/v1/tasks/${id}/reopen/`, {}),
  deleteTask: (id: string) => taskFlowApi.delete(`/api/v1/tasks/${id}/`),
  resetCloud: (confirmation: string) => taskFlowApi.post<void>("/api/v1/data/reset/", { confirmation }),
  uploadVoiceSession: (audio: Blob, fileName: string) => {
    const formData = new FormData();
    formData.append("audio", audio, fileName);
    return taskFlowApi.postForm<ApiEnvelope<VoiceSessionOutput>>("/api/v1/voice/sessions/", formData);
  },
  voiceSession: (id: string) =>
    taskFlowApi.get<ApiEnvelope<VoiceSessionOutput>>(`/api/v1/voice/sessions/${id}/`),
  createVoiceReview: (sessionId: string, currentListId?: string | null) =>
    taskFlowApi.post<ApiEnvelope<VoiceReviewDraft>>(`/api/v1/voice/sessions/${sessionId}/review/`, {
      ...(currentListId ? { current_list_id: currentListId } : {}),
    }),
  voiceReview: (sessionId: string) =>
    taskFlowApi.get<ApiEnvelope<VoiceReviewDraft>>(`/api/v1/voice/sessions/${sessionId}/review/`),
  confirmVoiceReview: (draftId: string, input: VoiceReviewConfirmation) =>
    taskFlowApi.post<ApiEnvelope<{ draft: VoiceReviewDraft; tasks: TaskOutput[] }>>(
      `/api/v1/voice/reviews/${draftId}/confirm/`,
      input,
    ),
};

async function getCsrfToken(request: typeof fetch): Promise<string> {
  const existingToken = readCookie(csrfCookieName);
  if (existingToken) {
    return existingToken;
  }
  const response = await request("/api/v1/auth/csrf/", { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    throw new TaskFlowApiError(response.status, await readErrorPayload(response));
  }
  const token = readCookie(csrfCookieName);
  if (!token) {
    throw new TaskFlowApiError(0, { code: "csrf_missing", message: "No se recibió el token CSRF." });
  }
  return token;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const cookie = document.cookie.split("; ").find((value) => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const payload = (await response.json()) as ApiErrorPayload & { error?: ApiErrorPayload };
    return payload.error ?? payload;
  } catch {
    return {};
  }
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}