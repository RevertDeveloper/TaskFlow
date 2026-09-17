import type { SyncRepository } from "@/domain/repositories/SyncRepository";
import type { SyncRunResult } from "@/domain/sync/models";
import { TaskFlowApiError } from "@/infrastructure/api/httpClient";
import { LocalReplica } from "@/infrastructure/repositories/LocalReplica";
import { ConflictResolver } from "./ConflictResolver";
import { SyncQueue } from "./SyncQueue";
import type { SyncTransport } from "./SyncTransport";

const MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 250;

export type SyncEvent =
  | { type: "retry"; attempt: number; delayMs: number }
  | { type: "push"; operations: number; accepted: number; rejected: number; conflicts: number }
  | { type: "pull"; changes: number; cursor: string | null }
  | { type: "error"; error: unknown };

export type SyncEngineOptions = {
  queue?: SyncQueue;
  replica?: LocalReplica;
  resolver?: ConflictResolver;
  isOnline?: () => boolean;
  maxAttempts?: number;
  retryBaseMs?: number;
  random?: () => number;
  wait?: (delayMs: number) => Promise<void>;
  onEvent?: (event: SyncEvent) => void;
};

export class SyncEngine {
  private readonly queue: SyncQueue;
  private readonly replica: LocalReplica;
  private readonly resolver: ConflictResolver;
  private readonly isOnline: () => boolean;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly random: () => number;
  private readonly wait: (delayMs: number) => Promise<void>;
  private readonly onEvent: (event: SyncEvent) => void;
  private activeRun: Promise<SyncRunResult> | null = null;

  constructor(
    private readonly repository: SyncRepository,
    private readonly transport: SyncTransport,
    options: SyncEngineOptions = {},
  ) {
    this.queue = options.queue ?? new SyncQueue(repository);
    this.replica = options.replica ?? new LocalReplica();
    this.resolver = options.resolver ?? new ConflictResolver();
    this.isOnline = options.isOnline ?? defaultIsOnline;
    this.maxAttempts = validateInteger(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, "maxAttempts", 1, 3);
    this.retryBaseMs = validateInteger(options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS, "retryBaseMs", 0, 60_000);
    this.random = options.random ?? Math.random;
    this.wait = options.wait ?? ((delayMs) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs)));
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  run(): Promise<SyncRunResult> {
    if (this.activeRun) {
      return this.activeRun;
    }
    const run = this.execute();
    this.activeRun = run.finally(() => {
      this.activeRun = null;
    });
    return this.activeRun;
  }

  private async execute(): Promise<SyncRunResult> {
    if (!this.isOnline()) {
      return pausedResult();
    }

    let pushed = 0;
    let pulled = 0;
    let conflicts = 0;
    let retries = 0;
    let cursor: string | null = null;

    try {
      cursor = await this.repository.getCursor();
      let operations = await this.queue.nextBatch();
      while (operations.length > 0) {
        if (!this.isOnline()) {
          return { status: "paused", pushed, pulled, conflicts, retries, error: null };
        }
        const response = await this.withRetry(() => this.transport.push(operations));
        retries += response.retries;
        const results = [...response.value.accepted, ...response.value.rejected, ...response.value.conflicts];
        const operationIds = new Set(operations.map((operation) => operation.id));
        const resultIds = new Set(results.map((result) => result.operationId));
        if (results.length !== operations.length
          || resultIds.size !== operationIds.size
          || [...resultIds].some((operationId) => !operationIds.has(operationId))) {
          throw new SyncProtocolError("El servidor no confirmó todas las operaciones enviadas.");
        }
        await this.queue.acknowledge(results);
        const replicaConflicts = await this.replica.applyChanges(
          response.value.changes,
          (localUpdatedAt, change) => this.resolver.decide(localUpdatedAt, change),
        );
        pushed += response.value.accepted.length;
        conflicts += response.value.conflicts.length;
        conflicts += replicaConflicts.filter((conflict) => conflict.resolution === "local").length;
        this.onEvent({
          type: "push",
          operations: operations.length,
          accepted: response.value.accepted.length,
          rejected: response.value.rejected.length,
          conflicts: response.value.conflicts.length,
        });
        operations = await this.queue.nextBatch();
      }

      let hasMore = true;
      while (hasMore) {
        if (!this.isOnline()) {
          return { status: "paused", pushed, pulled, conflicts, retries, error: null };
        }
        const response = await this.withRetry(() => this.transport.pull(cursor, MAX_BATCH_SIZE));
        retries += response.retries;
        if (response.value.hasMore && response.value.cursor === cursor && response.value.changes.length === 0) {
          throw new SyncProtocolError("El cursor de sincronización no avanzó.");
        }
        const replicaConflicts = await this.replica.applyChanges(
          response.value.changes,
          (localUpdatedAt, change) => this.resolver.decide(localUpdatedAt, change),
        );
        await this.repository.setCursor(response.value.cursor);
        cursor = response.value.cursor;
        pulled += response.value.changes.length;
        conflicts += replicaConflicts.filter((conflict) => conflict.resolution === "local").length;
        hasMore = response.value.hasMore;
        this.onEvent({ type: "pull", changes: response.value.changes.length, cursor });
      }

      return {
        status: pushed === 0 && pulled === 0 ? "idle" : "synced",
        pushed,
        pulled,
        conflicts,
        retries,
        error: null,
      };
    } catch (error) {
      this.onEvent({ type: "error", error });
      return { status: "error", pushed, pulled, conflicts, retries, error: errorMessage(error) };
    }
  }

  private async withRetry<Result>(request: () => Promise<Result>): Promise<{ value: Result; retries: number }> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return { value: await request(), retries: attempt - 1 };
      } catch (error) {
        if (!isTransient(error) || attempt === this.maxAttempts) {
          throw error;
        }
        const delayMs = this.retryBaseMs * 2 ** (attempt - 1) + Math.floor(this.random() * this.retryBaseMs);
        this.onEvent({ type: "retry", attempt, delayMs });
        await this.wait(delayMs);
      }
    }
    throw new SyncProtocolError("El motor de sincronización agotó sus intentos.");
  }
}

class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncProtocolError";
  }
}

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function validateInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return value;
}

function isTransient(error: unknown): boolean {
  if (error instanceof TaskFlowApiError) {
    return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "La sincronización no se pudo completar.";
}

function pausedResult(): SyncRunResult {
  return { status: "paused", pushed: 0, pulled: 0, conflicts: 0, retries: 0, error: null };
}