import type { SyncChange, SyncEntityVersion, SyncMergeDecision } from "@/domain/sync/models";

export class ConflictResolver {
  decide(localVersion: SyncEntityVersion | null, change: SyncChange): SyncMergeDecision {
    if (!localVersion) {
      return "remote";
    }
    if (change.updatedAt !== localVersion.updatedAt) {
      return change.updatedAt > localVersion.updatedAt ? "remote" : "local";
    }
    if (change.clientVersion !== localVersion.clientVersion) {
      return change.clientVersion > localVersion.clientVersion ? "remote" : "local";
    }
    const remoteOperationId = change.operationId ?? "";
    const localOperationId = localVersion.operationId ?? "";
    return remoteOperationId >= localOperationId ? "remote" : "local";
  }
}