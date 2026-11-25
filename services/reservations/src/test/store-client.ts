import { vi } from "vitest";
import type { StoreClient } from "../services/availability-config.js";

/**
 * A `$transaction` client whose transaction is `tx`, for the availability store suites.
 * The venue-context statements (`$executeRaw`, `$executeRawUnsafe`) are stubbed; `defaults`
 * seeds rows every test of a suite needs, and `tx` wins over both. Returns the merged
 * transaction too so a test can assert on what ran inside it. Typed `StoreClient`, so a
 * change to the real client's shape fails typecheck here, not at each suite.
 */
export function fakeStoreClient<T extends Record<string, unknown>>(
  tx: T,
  defaults: Record<string, unknown> = {}
): { client: StoreClient; tx: T & Record<string, unknown> } {
  const full = {
    $executeRaw: vi.fn(async () => 0),
    $executeRawUnsafe: vi.fn(async () => 0),
    ...defaults,
    ...tx,
  } as T & Record<string, unknown>;
  const client = {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(full)),
  } as unknown as StoreClient;
  return { client, tx: full };
}

/** Just the client, for suites that never read the merged transaction back. */
export const storeClientOf = (tx: Record<string, unknown>): StoreClient =>
  fakeStoreClient(tx).client;
