import { describe, expect, it } from "vitest";

import { safeNextPath } from "./client";

describe("safeNextPath", () => {
  it("accepts paths inside TaskFlow", () => {
    expect(safeNextPath("/app/dashboard")).toBe("/app/dashboard");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});