import { describe, expect, it } from "vitest";

import { createSnapshot, parseSnapshot } from "./Snapshot";

const ids = {
  device: "00000000-0000-4000-8000-000000000001",
  list: "00000000-0000-4000-8000-000000000002",
  task: "00000000-0000-4000-8000-000000000003",
  event: "00000000-0000-4000-8000-000000000004",
};

describe("TaskFlow snapshot contract", () => {
  it("creates a deterministic checksum and accepts reordered collections", async () => {
    const input = {
      lists: [listFixture()],
      tasks: [taskFixture()],
      events: [eventFixture()],
      sync: { device_id: ids.device, cursor: null, client_version: 2, pending_operations: 1 },
      generatedAt: "2026-09-17T10:00:00.000Z",
    };
    const snapshot = await createSnapshot(input);
    const parsed = await parseSnapshot({ ...snapshot, lists: [...snapshot.lists].reverse() });

    expect(parsed.checksum).toHaveLength(64);
    expect(parsed.counts).toEqual({ lists: 1, tasks: 1, events: 1, pending_operations: 1 });
    await expect(parseSnapshot(parsed)).resolves.toEqual(parsed);
  });

  it("rejects tampered data and count mismatches", async () => {
    const snapshot = await createSnapshot({
      lists: [listFixture()],
      tasks: [taskFixture()],
      events: [],
      sync: { device_id: ids.device, cursor: null, client_version: 0, pending_operations: 0 },
    });

    await expect(parseSnapshot({
      ...snapshot,
      tasks: [{ ...snapshot.tasks[0], title: "Contenido alterado" }],
    })).rejects.toThrow("checksum");
    await expect(parseSnapshot({ ...snapshot, counts: { ...snapshot.counts, tasks: 0 } })).rejects.toThrow("counts");
  });

  it("rejects a task that points to a list outside the snapshot", async () => {
    const snapshot = await createSnapshot({
      lists: [listFixture()],
      tasks: [taskFixture()],
      events: [],
      sync: { device_id: ids.device, cursor: null, client_version: 0, pending_operations: 0 },
    });
    const invalid = { ...snapshot, tasks: [{ ...snapshot.tasks[0], list_id: ids.task }] };
    const rebuilt = await createSnapshot({
      lists: invalid.lists,
      tasks: invalid.tasks,
      events: invalid.events,
      sync: invalid.sync,
      generatedAt: invalid.generated_at,
    });

    await expect(parseSnapshot(rebuilt)).rejects.toThrow("lista propietaria");
  });
});

function listFixture() {
  return {
    id: ids.list,
    name: "Inbox",
    description: "",
    emoji: "",
    color: "",
    position: 0,
    is_archived: false,
    is_system: true,
    created_at: "2026-09-17T10:00:00.000Z",
    updated_at: "2026-09-17T10:00:00.000Z",
    deleted_at: null,
  };
}

function taskFixture() {
  return {
    id: ids.task,
    list_id: ids.list,
    title: "Preparar entrega",
    description: "",
    status: "pending" as const,
    source: "manual" as const,
    position: 0,
    completed_at: null,
    created_at: "2026-09-17T10:00:00.000Z",
    updated_at: "2026-09-17T10:00:00.000Z",
    deleted_at: null,
  };
}

function eventFixture() {
  return {
    id: ids.event,
    task_id: ids.task,
    event_type: "TASK_CREATED",
    payload: { title: "Preparar entrega" },
    created_at: "2026-09-17T10:00:00.000Z",
  };
}