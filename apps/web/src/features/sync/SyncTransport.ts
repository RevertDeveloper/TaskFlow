import type {
  SyncChange,
  SyncOperation,
  SyncPullResult,
  SyncPushResult,
} from "@/domain/sync/models";
import { TaskFlowHttpClient, taskFlowApi } from "@/infrastructure/api/httpClient";

export interface SyncTransport {
  push(operations: SyncOperation[]): Promise<SyncPushResult>;
  pull(cursor: string | null, limit?: number): Promise<SyncPullResult>;
}

type ApiEnvelope<T> = {
  data: T;
};

type RawOperationResult = {
  operation_id: string;
  idempotency_key?: string;
  duplicate?: boolean;
  code?: string;
  message?: string;
};

type RawChange = {
  entity_type: "list" | "task";
  entity_id: string;
  operation: "upsert" | "delete";
  updated_at: string;
  data: Record<string, unknown>;
};

type RawPushResult = {
  version: 1;
  sync_id: string;
  accepted: RawOperationResult[];
  rejected: RawOperationResult[];
  conflicts: RawOperationResult[];
  changes: RawChange[];
};

type RawPullResult = {
  version: 1;
  cursor: string | null;
  has_more: boolean;
  changes: RawChange[];
};

export class HttpSyncTransport implements SyncTransport {
  constructor(private readonly client: TaskFlowHttpClient = taskFlowApi) {}

  async push(operations: SyncOperation[]): Promise<SyncPushResult> {
    const response = await this.client.post<ApiEnvelope<RawPushResult>>(
      "/api/v1/sync/push/",
      {
        version: 1,
        operations: operations.map(toWireOperation),
      },
    );
    return mapPushResult(response.data);
  }

  async pull(cursor: string | null, limit = 100): Promise<SyncPullResult> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const response = await this.client.get<ApiEnvelope<RawPullResult>>(
      `/api/v1/sync/pull/?${query.toString()}`,
    );
    return mapPullResult(response.data);
  }
}

function toWireOperation(operation: SyncOperation) {
  return {
    operation_id: operation.id,
    device_id: operation.deviceId,
    entity_type: operation.entityType,
    entity_id: operation.entityId,
    mutation: operation.operation,
    client_version: operation.clientVersion,
    client_timestamp: operation.occurredAt,
    payload_version: operation.payloadVersion,
    payload: operation.payload,
    idempotency_key: operation.idempotencyKey,
  };
}

function mapPushResult(result: RawPushResult): SyncPushResult {
  return {
    version: result.version,
    syncId: result.sync_id,
    accepted: result.accepted.map(mapOperationResult),
    rejected: result.rejected.map(mapOperationResult),
    conflicts: result.conflicts.map(mapOperationResult),
    changes: result.changes.map(mapChange),
  };
}

function mapPullResult(result: RawPullResult): SyncPullResult {
  return {
    version: result.version,
    cursor: result.cursor,
    hasMore: result.has_more,
    changes: result.changes.map(mapChange),
  };
}

function mapOperationResult(result: RawOperationResult) {
  return {
    operationId: result.operation_id,
    idempotencyKey: result.idempotency_key,
    duplicate: result.duplicate,
    code: result.code,
    message: result.message,
  };
}

function mapChange(change: RawChange): SyncChange {
  return {
    entityType: change.entity_type,
    entityId: change.entity_id,
    operation: change.operation,
    updatedAt: change.updated_at,
    data: mapEntityData(change.data),
  };
}

function mapEntityData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [toCamelCase(key), value]),
  );
}

function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}