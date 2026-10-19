import { describe, expect, it, vi } from "vitest";

import type { SyncOperation } from "@/domain/sync/models";
import type { TaskFlowHttpClient } from "@/infrastructure/api/httpClient";
import { HttpSyncTransport } from "./SyncTransport";

describe("HttpSyncTransport", () => {
  it("maps wire protocol names and entity fields at the HTTP boundary", async () => {
    const client = {
      post: vi.fn().mockResolvedValue({
        data: {
          version: 1,
          sync_id: "sync-1",
          accepted: [{ operation_id: "operation-1", idempotency_key: "key-1", duplicate: false }],
          rejected: [],
          conflicts: [],
          changes: [{
            entity_type: "task",
            entity_id: "task-1",
            operation: "upsert",
            updated_at: "2026-09-17T10:00:00Z",
            client_version: 2,
            operation_id: "00000000-0000-4000-8000-000000000001",
            data: {
              id: "task-1",
              list_id: "list-1",
              is_archived: false,
              completed_at: null,
              updated_at: "2026-09-17T10:00:00Z",
            },
          }],
        },
      }),
      get: vi.fn(),
    } as unknown as TaskFlowHttpClient;
    const operation = operationFixture();

    await expect(new HttpSyncTransport(client).push([operation])).resolves.toMatchObject({
      syncId: "sync-1",
      accepted: [{ operationId: "operation-1" }],
      changes: [{
        clientVersion: 2,
        operationId: "00000000-0000-4000-8000-000000000001",
        data: { listId: "list-1", isArchived: false, completedAt: null },
      }],
    });
    expect(client.post).toHaveBeenCalledWith("/api/v1/sync/push/", {
      version: 1,
      operations: [expect.objectContaining({
        operation_id: operation.id,
        mutation: "update",
        client_timestamp: operation.occurredAt,
      })],
    });
  });

  it("keeps opaque cursors and translates pull pagination", async () => {
    const client = {
      post: vi.fn(),
      get: vi.fn().mockResolvedValue({
        data: { version: 1, cursor: "opaque-cursor", has_more: false, changes: [] },
      }),
    } as unknown as TaskFlowHttpClient;

    await expect(new HttpSyncTransport(client).pull("old-cursor", 100)).resolves.toEqual({
      version: 1,
      cursor: "opaque-cursor",
      hasMore: false,
      changes: [],
    });
    expect(client.get).toHaveBeenCalledWith(
      "/api/v1/sync/pull/?limit=100&cursor=old-cursor",
    );
  });

  it("maps note and folder tombstones into the shared sync change model", async () => {
    const client = {
      post: vi.fn(),
      get: vi.fn().mockResolvedValue({
        data: {
          version: 1,
          cursor: "note-cursor",
          has_more: false,
          changes: [{
            entity_type: "note",
            entity_id: "note-1",
            operation: "delete",
            updated_at: "2026-09-17T10:00:00Z",
            client_version: 3,
            operation_id: "00000000-0000-4000-8000-000000000003",
            data: { id: "note-1", folder_id: "folder-1", deleted_at: "2026-09-17T10:00:00Z" },
          }, {
            entity_type: "folder",
            entity_id: "folder-1",
            operation: "upsert",
            updated_at: "2026-09-17T09:00:00Z",
            client_version: 2,
            operation_id: null,
            data: { id: "folder-1", parent_id: null, created_at: "2026-09-17T08:00:00Z" },
          }],
        },
      }),
    } as unknown as TaskFlowHttpClient;

    await expect(new HttpSyncTransport(client).pull(null)).resolves.toMatchObject({
      changes: [
        { entityType: "note", operation: "delete", data: { folderId: "folder-1", deletedAt: "2026-09-17T10:00:00Z" } },
        { entityType: "folder", data: { parentId: null, createdAt: "2026-09-17T08:00:00Z" } },
      ],
    });
  });
});

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