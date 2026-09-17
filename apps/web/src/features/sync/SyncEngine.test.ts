import { describe, expect, it, vi } from "vitest";

import type { SyncRepository } from "@/domain/repositories/SyncRepository";
import type { SyncChange, SyncOperation, SyncRunResult } from "@/domain/sync/models";
import { TaskFlowApiError } from "@/infrastructure/api/httpClient";
import type { LocalReplica } from "@/infrastructure/repositories/LocalReplica";
import { SyncEngine } from "./SyncEngine";
import type { SyncTransport } from "./SyncTransport";

describe("SyncEngine", () => {
  it("acknowledges accepted, rejected and conflict results in one batch", async () => {
    const operation = operationFixture();
    const second = { ...operation, id: "operation-2", idempotencyKey: "key-2" };
    const repository = fakeRepository([operation, second]);
    const transport = fakeTransport({
      push: vi.fn().mockResolvedValue({
        version: 1,
        syncId: "sync-1",
        accepted: [{ operationId: operation.id }],
        rejected: [{ operationId: second.id, code: "invalid_payload" }],
        conflicts: [],
        changes: [],
      }),
    });
    const replica = fakeReplica();

    const result = await new SyncEngine(repository, transport, { replica }).run();

    expect(result).toMatchObject({ status: "synced", pushed: 1, pulled: 0 });
    expect(repository.markProcessed).toHaveBeenCalledTimes(2);
    expect(repository.markProcessed).toHaveBeenCalledWith(operation.id);
    expect(repository.markProcessed).toHaveBeenCalledWith(second.id);
    expect(transport.pull).toHaveBeenCalledWith(null, 100);
  });

  it("retries transient failures with bounded deterministic backoff", async () => {
    const operation = operationFixture();
    const repository = fakeRepository([operation]);
    const push = vi.fn().mockRejectedValueOnce(new TaskFlowApiError(503)).mockResolvedValue({
      version: 1,
      syncId: "sync-1",
      accepted: [{ operationId: operation.id }],
      rejected: [],
      conflicts: [],
      changes: [],
    });
    const transport = fakeTransport({ push });
    const wait = vi.fn().mockResolvedValue(undefined);
    const events: string[] = [];

    const result = await new SyncEngine(repository, transport, {
      wait,
      random: () => 0,
      onEvent: (event) => events.push(event.type),
    }).run();

    expect(result).toMatchObject({ status: "synced", pushed: 1, retries: 1 });
    expect(push).toHaveBeenCalledTimes(2);
    expect(transport.pull).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(250);
    expect(events).toContain("retry");
  });

  it("pauses without touching the transport while offline", async () => {
    const repository = fakeRepository([]);
    const transport = fakeTransport();

    await expect(new SyncEngine(repository, transport, { isOnline: () => false }).run()).resolves.toEqual({
      status: "paused",
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      retries: 0,
      error: null,
    } satisfies SyncRunResult);
    expect(transport.push).not.toHaveBeenCalled();
    expect(transport.pull).not.toHaveBeenCalled();
  });

  it("applies a pull page before persisting its cursor", async () => {
    const repository = fakeRepository([]);
    const changes: SyncChange[] = [{
      entityType: "list",
      entityId: "list-1",
      operation: "upsert",
      updatedAt: "2026-09-17T10:00:00Z",
      clientVersion: 1,
      operationId: null,
      data: {},
    }];
    const transport = fakeTransport({
      pull: vi.fn().mockResolvedValue({ version: 1, cursor: "cursor-1", hasMore: false, changes }),
    });
    const replica = fakeReplica();
    const order: string[] = [];
    replica.applyChanges.mockImplementation(async () => {
      order.push("apply");
      return [];
    });
    (repository.setCursor as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("cursor");
    });

    const result = await new SyncEngine(repository, transport, { replica }).run();

    expect(result).toMatchObject({ status: "synced", pulled: 1 });
    expect(order).toEqual(["apply", "cursor"]);
  });
});

function fakeRepository(operations: SyncOperation[]): SyncRepository {
  return {
    findPending: vi.fn()
      .mockResolvedValueOnce(operations)
      .mockResolvedValue([]),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    getCursor: vi.fn().mockResolvedValue(null),
    setCursor: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeTransport(overrides: Partial<SyncTransport> = {}): SyncTransport & {
  push: ReturnType<typeof vi.fn>;
  pull: ReturnType<typeof vi.fn>;
} {
  return {
    push: vi.fn().mockResolvedValue({
      version: 1,
      syncId: "sync-1",
      accepted: [],
      rejected: [],
      conflicts: [],
      changes: [],
    }),
    pull: vi.fn().mockResolvedValue({ version: 1, cursor: null, hasMore: false, changes: [] }),
    ...overrides,
  } as SyncTransport & { push: ReturnType<typeof vi.fn>; pull: ReturnType<typeof vi.fn> };
}

function fakeReplica(): LocalReplica & { applyChanges: ReturnType<typeof vi.fn> } {
  return {
    applyChanges: vi.fn().mockResolvedValue([]),
  } as unknown as LocalReplica & { applyChanges: ReturnType<typeof vi.fn> };
}

function operationFixture(): SyncOperation {
  return {
    id: "operation-1",
    deviceId: "device-1",
    entityType: "task",
    entityId: "task-1",
    operation: "update",
    clientVersion: 2,
    occurredAt: "2026-09-17T10:00:00Z",
    processedAt: null,
    idempotencyKey: "key-1",
    payloadVersion: 1,
    payload: { entityId: "task-1", title: "Preparar entrega" },
  };
}