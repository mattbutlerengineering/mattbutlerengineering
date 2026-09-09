import { describe, it, expect } from "vitest";
import { countRialtoComponents } from "./rialto-components.js";

describe("countRialtoComponents", () => {
  it("returns the number of entries in the manifest's components array", () => {
    expect(countRialtoComponents({ components: [{}, {}, {}] })).toBe(3);
  });

  it("returns 0 for an empty manifest", () => {
    expect(countRialtoComponents({ components: [] })).toBe(0);
  });
});
