import type {
  ApiErrorPayload,
  HistoryOutput,
  ListCreate,
  ListOutput,
  TaskCreate,
  TaskOutput,
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
    private readonly request: typeof fetch = fetch,
  ) {}

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, { ...options, method: "GET" });
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
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
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Request-ID", createRequestId());

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      headers.set("X-CSRFToken", await getCsrfToken(this.request));
    }

    try {
      const response = await this.request(`${this.baseUrl}${path}`, {
        ...options,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "include",
        cache: "no-store",
        headers,
        signal: options.signal ?? controller.signal,
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
    }
  }
}

export const taskFlowApi = new TaskFlowHttpClient();

export const api = {
  lists: () => taskFlowApi.get<ListOutput[]>("/api/v1/lists/"),
  tasks: () => taskFlowApi.get<TaskOutput[]>("/api/v1/tasks/"),
  history: () => taskFlowApi.get<HistoryOutput[]>("/api/v1/history/"),
  createList: (input: ListCreate) => taskFlowApi.post<ListOutput>("/api/v1/lists/", input),
  createTask: (input: TaskCreate) => taskFlowApi.post<TaskOutput>("/api/v1/tasks/", input),
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
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}