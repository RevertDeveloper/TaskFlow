import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskList } from "@/domain/list/models";
import type { VoiceReviewDraft } from "@/infrastructure/api/generated/types";

import { VoiceReview } from "./VoiceReview";

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const lists: TaskList[] = [
  {
    id: "inbox-id",
    name: "Inbox",
    description: "",
    emoji: "",
    color: "",
    position: 0,
    isArchived: false,
    isSystem: true,
  },
  {
    id: "work-id",
    name: "Trabajo",
    description: "",
    emoji: "",
    color: "",
    position: 1,
    isArchived: false,
    isSystem: false,
  },
];

const draft: VoiceReviewDraft = {
  id: "draft-id",
  session_id: "session-id",
  status: "draft",
  schema_version: 1,
  tasks: [
    {
      title: "Preparar entrega",
      description: null,
      list_id: "work-id",
      classification_hint: "semantic",
      confidence: 0.8,
      routing: "semantic",
    },
    {
      title: "Comprar leche",
      description: "",
      list_id: "inbox-id",
      classification_hint: "inbox",
      confidence: 1,
      routing: "inbox",
    },
  ],
  source: { kind: "voice_transcript" },
  expires_at: "2026-09-17T14:00:00Z",
  confirmed_task_ids: [],
  created_at: "2026-09-17T13:00:00Z",
  updated_at: "2026-09-17T13:00:00Z",
};

describe("VoiceReview", () => {
  afterEach(() => cleanup());

  it("edits a draft and confirms only selected tasks", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<VoiceReview draft={draft} lists={lists} open onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText("Tarea 1"), { target: { value: "Preparar release" } });
    fireEvent.change(screen.getAllByLabelText("Lista", { selector: "select" })[0], {
      target: { value: "inbox-id" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Crear seleccionadas" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm).toHaveBeenCalledWith([
      { title: "Preparar release", description: null, list_id: "inbox-id" },
    ]);
  });

  it("removes a task from the review without creating it", () => {
    render(<VoiceReview draft={draft} lists={lists} open onClose={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar tarea 2" }));

    expect(screen.queryByLabelText("Tarea 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tarea 1")).toBeInTheDocument();
  });
});
