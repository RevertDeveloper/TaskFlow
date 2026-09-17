export type SyncEntityType = "list" | "task";
export type SyncOperationType = "create" | "update" | "delete";

export type SyncOperation = {
  id: string;
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  clientVersion: number;
  occurredAt: string;
  processedAt: string | null;
  idempotencyKey: string;
  payloadVersion: number;
  payload: Record<string, unknown>;
};

export type SyncChange = {
  entityType: SyncEntityType;
  entityId: string;
  operation: "upsert" | "delete";
  updatedAt: string;
  data: Record<string, unknown>;
  clientVersion?: number;
  operationId?: string;
};

export type SyncPushResult = {
  version: 1;
  syncId: string;
  accepted: SyncOperationResult[];
  rejected: SyncOperationResult[];
  conflicts: SyncOperationResult[];
  changes: SyncChange[];
};

export type SyncOperationResult = {
  operationId: string;
  idempotencyKey?: string;
  duplicate?: boolean;
  code?: string;
  message?: string;
};

export type SyncPullResult = {
  version: 1;
  cursor: string | null;
  hasMore: boolean;
  changes: SyncChange[];
};

export type SyncRunStatus = "synced" | "idle" | "paused" | "error";

export type SyncRunResult = {
  status: SyncRunStatus;
  pushed: number;
  pulled: number;
  conflicts: number;
  retries: number;
  error: string | null;
};

export type SyncMergeDecision = "remote" | "local";

export type SyncMergeDecider = (
  localUpdatedAt: string | null,
  change: SyncChange,
) => SyncMergeDecision;