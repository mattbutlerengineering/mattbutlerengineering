import { describe, it, expect, vi } from "vitest";
import { createDeliveryDedupStore, defaultDeliveryDedupStore } from "./webhook-delivery-dedup.js";

describe("createDeliveryDedupStore", () => {
  it("claims a fresh delivery id, returning true", () => {
    const store = createDeliveryDedupStore();
    expect(store.claim("delivery-1")).toBe(true);
  });

  it("rejects a replay of an already-claimed delivery id", () => {
    const store = createDeliveryDedupStore();
    store.claim("delivery-1");
    expect(store.claim("delivery-1")).toBe(false);
  });

  it("treats different delivery ids independently", () => {
    const store = createDeliveryDedupStore();
    expect(store.claim("delivery-1")).toBe(true);
    expect(store.claim("delivery-2")).toBe(true);
  });

  it("allows a delivery id to be reclaimed once it ages out past retentionMs", () => {
    vi.useFakeTimers();
    try {
      const store = createDeliveryDedupStore(1000);
      expect(store.claim("delivery-1")).toBe(true);
      vi.advanceTimersByTime(1001);
      expect(store.claim("delivery-1")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still rejects a replay inside the retention window", () => {
    vi.useFakeTimers();
    try {
      const store = createDeliveryDedupStore(1000);
      expect(store.claim("delivery-1")).toBe(true);
      vi.advanceTimersByTime(500);
      expect(store.claim("delivery-1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("defaultDeliveryDedupStore", () => {
  it("is a shared, process-wide instance", () => {
    expect(defaultDeliveryDedupStore.claim("shared-check-unique-id")).toBe(true);
    expect(defaultDeliveryDedupStore.claim("shared-check-unique-id")).toBe(false);
  });
});
