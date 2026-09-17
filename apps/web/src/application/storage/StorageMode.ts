export type StorageMode = "cloud" | "device";

export function parseStorageMode(value: unknown): StorageMode {
  return value === "device" ? "device" : "cloud";
}

export function configuredStorageMode(): StorageMode {
  return parseStorageMode(process.env.NEXT_PUBLIC_STORAGE_MODE);
}