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

  it("keeps the request timeout active with an external abort signal", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      }),
    );
    const client = new TaskFlowHttpClient("", 10, request);
    const externalController = new AbortController();

    try {
      const pending = expect(
        client.get("/api/v1/example/", { signal: externalController.signal }),
      ).rejects.toMatchObject({ status: 408, code: "request_timeout" });
      await vi.advanceTimersByTimeAsync(10);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps multipart uploads as FormData and sends CSRF", async () => {
    document.cookie = "taskflowcsrftoken=csrf-value";
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: {}, meta: {} }), { status: 202 }),
    );
    const client = new TaskFlowHttpClient("", 1_000, request);
    const formData = new FormData();
    formData.append("audio", new Blob(["audio"], { type: "audio/webm" }), "recording.webm");

    await client.postForm("/api/v1/voice/sessions/", formData);

    const options = request.mock.calls[0]?.[1];
    const headers = options?.headers as Headers;
    expect(options?.body).toBe(formData);
    expect(headers.get("Content-Type")).toBeNull();
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