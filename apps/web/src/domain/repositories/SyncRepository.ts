import type { SyncOperation } from "@/domain/sync/models";

export interface SyncRepository {
  findPending(limit?: number): Promise<SyncOperation[]>;
  findByIdempotencyKey(idempotencyKey: string): Promise<SyncOperation | null>;
  markProcessed(id: string, processedAt?: string): Promise<void>;
  getCursor(): Promise<string | null>;
  setCursor(cursor: string | null): Promise<void>;
}