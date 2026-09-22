import { describe, expect, it } from "vitest";

import { createApiRequestHeaders } from "./proxy";

describe("API proxy headers", () => {
  it("preserves the public host for Django host validation", () => {
    const headers = createApiRequestHeaders({
      headers: new Headers({ host: "api:8000" }),
      nextUrl: { host: "taskflow.carlosrevert.es" },
    });

    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("x-forwarded-host")).toBe("taskflow.carlosrevert.es");
    expect(headers.get("host")).toBe("taskflow.carlosrevert.es");
  });
});