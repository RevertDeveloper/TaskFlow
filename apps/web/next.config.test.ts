import { afterEach, describe, expect, it, vi } from "vitest";

describe("Next production routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("proxies same-origin API requests with the Django trailing slash", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://api:8000/");
    const { default: nextConfig } = await import("./next.config");
    const rewrites = await nextConfig.rewrites?.();

    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
    expect(rewrites).toEqual([
      { source: "/api/:path*", destination: "http://api:8000/api/:path*" },
    ]);
  });
});