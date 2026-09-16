import { describe, expect, it, vi } from "vitest";

import { TaskFlowHttpClient } from "./httpClient";

describe("TaskFlowHttpClient", () => {
  it("sends credentials, request id and parses successful responses", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = new TaskFlowHttpClient("", 1_000, request);

    await expect(client.get<{ ok: boolean }>("/api/v1/example/")).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith(
      "/api/v1/example/",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    const headers = request.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("X-Request-ID")).toEqual(expect.any(String));
  });

  it("normalizes API errors without exposing the response body as a raw exception", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: "invalid", message: "Título inválido" }), { status: 422 }),
    );
    const client = new TaskFlowHttpClient("", 1_000, request);

    await expect(client.get("/api/v1/example/")).rejects.toMatchObject({
      status: 422,
      code: "invalid",
      message: "Título inválido",
    });
  });

  it("sends CSRF on DELETE requests without a body", async () => {
    document.cookie = "taskflowcsrftoken=csrf-value";
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new TaskFlowHttpClient("", 1_000, request);

    await client.delete("/api/v1/tasks/task-id/");

    const headers = request.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("X-CSRFToken")).toBe("csrf-value");
  });

  it("binds the default fetch transport to globalThis", async () => {
    document.cookie = "taskflowcsrftoken=csrf-value";
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", request);

    try {
      await new TaskFlowHttpClient().delete("/api/v1/tasks/task-id/");
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }

    expect(request).toHaveBeenCalledOnce();
  });
});