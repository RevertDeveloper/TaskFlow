import type { StorageMode } from "./StorageMode";

export type StorageAuthority = "remote" | "local";
export type StorageSource = "remote" | "local" | "unknown";
export type StorageAvailability = "loading" | "available" | "unavailable";
export type StorageSyncStatus = "disabled" | "idle" | "pending" | "paused" | "error";

export type StorageState = {
  mode: StorageMode;
  authority: StorageAuthority;
  source: StorageSource;
  isStale: boolean;
  pendingOperations: number;
  lastRemoteSuccessAt: string | null;
  lastSyncedAt: string | null;
  syncStatus: StorageSyncStatus;
  availability: StorageAvailability;
  replicaAvailable: boolean;
  error: string | null;
};

export type StorageStateListener = (state: StorageState) => void;