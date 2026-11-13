import { describe, expect, it } from "vitest";
import { OPENED_FROM_HUB, wasOpenedFromHub } from "./opened-from-hub.js";

describe("wasOpenedFromHub", () => {
  it("is true for the state a hub row's action carries", () => {
    expect(wasOpenedFromHub(OPENED_FROM_HUB)).toBe(true);
  });

  it.each([null, undefined, "hub", { openedFrom: "setup" }, { from: "hub" }, {}])(
    "is false for %j",
    (state) => {
      expect(wasOpenedFromHub(state)).toBe(false);
    }
  );
});
