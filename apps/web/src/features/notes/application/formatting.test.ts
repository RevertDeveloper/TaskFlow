import { describe, expect, it } from "vitest";

import { applyHighlight } from "./formatting";

describe("note formatting", () => {
  it("splits a selected span and applies a bicolor highlight", () => {
    expect(applyHighlight([{ text: "hello world" }], 6, 11, "mint")).toEqual([
      { text: "hello " },
      { text: "world", format: { highlight: "mint" } },
    ]);
  });

  it("toggles the same highlight off", () => {
    expect(applyHighlight([{ text: "hello", format: { highlight: "pink" } }], 0, 5, "pink"))
      .toEqual([{ text: "hello", format: undefined }]);
  });
});
