import type { SyncChange, SyncMergeDecision } from "@/domain/sync/models";

export class ConflictResolver {
  decide(localUpdatedAt: string | null, change: SyncChange): SyncMergeDecision {
    if (!localUpdatedAt) {
      return "remote";
    }
    return change.updatedAt >= localUpdatedAt ? "remote" : "local";
  }
}