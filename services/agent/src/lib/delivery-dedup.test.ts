import { describe, it, expect, beforeEach, vi } from "vitest";
import { isDuplicateDelivery, __resetDeliveryDedupForTests } from "./delivery-dedup.js";

describe("delivery-dedup", () => {
  beforeEach(() => {
    __resetDeliveryDedupForTests();
    vi.useRealTimers();
  });

  it("returns false the first time a delivery id is seen", () => {
    expect(isDuplicateDelivery("delivery-1")).toBe(false);
  });

  it("returns true for a delivery id already seen", () => {
    isDuplicateDelivery("delivery-2");
    expect(isDuplicateDelivery("delivery-2")).toBe(true);
  });

  it("treats different delivery ids independently", () => {
    isDuplicateDelivery("delivery-3");
    expect(isDuplicateDelivery("delivery-4")).toBe(false);
  });
});
