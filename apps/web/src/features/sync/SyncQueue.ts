import type { SyncOperationResult } from "@/domain/sync/models";
import type { SyncRepository } from "@/domain/sync/ports";

const MAX_BATCH_SIZE = 100;

export class SyncQueue {
  constructor(
    private readonly repository: SyncRepository,
    private readonly batchSize = MAX_BATCH_SIZE,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
      throw new RangeError("El tamaño de lote de sincronización debe estar entre 1 y 100.");
    }
  }

  nextBatch() {
    return this.repository.findPending(this.batchSize);
  }

  async acknowledge(results: SyncOperationResult[]): Promise<number> {
    const operationIds = new Set(results.map((result) => result.operationId));
    for (const operationId of operationIds) {
      await this.repository.markProcessed(operationId);
    }
    return operationIds.size;
  }
}