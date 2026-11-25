import { describe, it, expect, vi } from "vitest";
import { fakeStoreClient } from "./store-client.js";

describe("fakeStoreClient", () => {
  it("runs the transaction work against the supplied tx, with the venue-context statements stubbed", async () => {
    const findMany = vi.fn(async () => [1]);
    const { client, tx } = fakeStoreClient({ thing: { findMany } });

    const out = await client.$transaction(async (t) => {
      expect(t).toBe(tx);
      return (t as unknown as { thing: { findMany: () => Promise<number[]> } }).thing.findMany();
    });

    expect(out).toEqual([1]);
    expect(await (tx.$executeRaw as () => Promise<number>)()).toBe(0);
    expect(await (tx.$executeRawUnsafe as () => Promise<number>)()).toBe(0);
  });

  it("lets the tx override a default and keeps the defaults it does not name", () => {
    const venue = { findUnique: vi.fn(async () => null) };
    const { tx } = fakeStoreClient({ venue }, { venue: { findUnique: vi.fn(async () => ({})) } });

    expect(tx.venue).toBe(venue);
  });
});
