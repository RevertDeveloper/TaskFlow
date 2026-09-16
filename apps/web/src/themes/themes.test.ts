import { describe, expect, it } from "vitest";

import { minimalTheme } from "./minimal";
import { starkTheme } from "./stark";

describe("TaskFlow themes", () => {
  it("exposes two token sets without coupling components to color values", () => {
    expect(starkTheme.name).toBe("stark");
    expect(minimalTheme.name).toBe("minimal");
    expect(starkTheme.tokens.colorCanvas).not.toBe(minimalTheme.tokens.colorCanvas);
    expect(starkTheme.tokens.colorAccent).not.toBe(minimalTheme.tokens.colorAccent);
  });
});