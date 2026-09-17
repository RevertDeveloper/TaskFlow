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