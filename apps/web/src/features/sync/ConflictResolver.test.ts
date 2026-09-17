import { describe, expect, it } from "vitest";

import type { SyncChange } from "@/domain/sync/models";
import { ConflictResolver } from "./ConflictResolver";

describe("ConflictResolver", () => {
  it("uses client version when server timestamps tie", () => {
    const resolver = new ConflictResolver();
    const change = changeFixture({ clientVersion: 3, operationId: "00000000-0000-4000-8000-000000000002" });

    expect(resolver.decide({
      updatedAt: change.updatedAt,
      clientVersion: 2,
      operationId: "00000000-0000-4000-8000-000000000003",
    }, change)).toBe("remote");
  });

  it("uses operation UUID when timestamps and versions tie", () => {
    const resolver = new ConflictResolver();
    const change = changeFixture({ operationId: "00000000-0000-4000-8000-000000000003" });

    expect(resolver.decide({
      updatedAt: change.updatedAt,
      clientVersion: change.clientVersion,
      operationId: "00000000-0000-4000-8000-000000000002",
    }, change)).toBe("remote");
  });
});

function changeFixture(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    entityType: "task",
    entityId: "00000000-0000-4000-8000-000000000010",
    operation: "upsert",
    updatedAt: "2026-09-17T10:00:00Z",
    clientVersion: 2,
    operationId: "00000000-0000-4000-8000-000000000001",
    data: {},
    ...overrides,
  };
}