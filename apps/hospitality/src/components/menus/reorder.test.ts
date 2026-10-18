import { describe, it, expect } from "vitest";
import { moveId } from "./reorder.js";

describe("moveId", () => {
  it("moves an id to a new index without mutating the input", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveId(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveId(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps the target index and ignores unknown ids", () => {
    expect(moveId(["a", "b"], "a", 9)).toEqual(["b", "a"]);
    expect(moveId(["a", "b"], "b", -3)).toEqual(["b", "a"]);
    expect(moveId(["a", "b"], "z", 0)).toEqual(["a", "b"]);
  });
});
