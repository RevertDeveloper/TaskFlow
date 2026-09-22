import { afterEach, describe, expect, it, vi } from "vitest";

import { accountsLoginUrl, logout, safeNextPath } from "./client";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("accountsLoginUrl", () => {
  it("returns to TaskFlow after Accounts authenticates", () => {
    expect(accountsLoginUrl("/")).toBe(
      "https://cuenta.carlosrevert.es/login/?next=https%3A%2F%2Ftaskflow.carlosrevert.es%2F",
    );
  });

  it("does not allow an external return path", () => {
    expect(accountsLoginUrl("https://evil.example")).toContain(
      "next=https%3A%2F%2Ftaskflow.carlosrevert.es%2F",
    );
  });
});

describe("safeNextPath", () => {
  it("accepts paths inside TaskFlow", () => {
    expect(safeNextPath("/app/dashboard")).toBe("/app/dashboard");
    expect(safeNextPath("/")).toBe("/");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

describe("logout", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it("requests TaskFlow CSRF before closing an authenticated session", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("taskflowcsrftoken=csrf-token");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "CSRF cookie set" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await logout();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/csrf/",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/accounts/logout/",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-CSRFToken": "csrf-token" }),
      }),
    );
  });
});