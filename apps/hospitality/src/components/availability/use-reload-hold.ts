import { useSyncExternalStore } from "react";

/**
 * The newest config version each venue's own saves have produced, and how many are under way.
 * Kept outside React because the config query outlives every drawer: closing one must not forget
 * that the config on hand is behind a save. Written by the mutation hooks that move the version.
 */
const savedVersions = new Map<string, number>();
const savesUnderWay = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function addSaveUnderWay(venueId: string, by: 1 | -1) {
  savesUnderWay.set(venueId, (savesUnderWay.get(venueId) ?? 0) + by);
  emit();
}

/** Runs a save that moves the venue's config version, and records the version it produced. */
export async function trackOwnSave<T extends { readonly version: number }>(
  venueId: string,
  run: () => Promise<T>
): Promise<T> {
  addSaveUnderWay(venueId, 1);
  try {
    const result = await run();
    savedVersions.set(venueId, Math.max(savedVersions.get(venueId) ?? 0, result.version));
    return result;
  } finally {
    // A refused save moved nothing, so there is no version to wait for.
    addSaveUnderWay(venueId, -1);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether the config on hand is behind a save of the Manager's own, or may be about to be. A draft
 * made on it would be checked against the old version and refused as a conflict with that save,
 * so editing waits. Comparing versions rather than watching the query covers a reload in flight
 * and a failed one alike. `reloadDue` is what a surface must offer a reload for: a hold nothing
 * else would end, whether the reload failed or answered with a version older than the save.
 */
export function useReloadHold(venueId: string | undefined, version: number | undefined) {
  const saving = useSyncExternalStore(subscribe, () =>
    venueId === undefined ? 0 : (savesUnderWay.get(venueId) ?? 0)
  );
  const saved = useSyncExternalStore(subscribe, () =>
    venueId === undefined ? 0 : (savedVersions.get(venueId) ?? 0)
  );
  const reloadDue = version !== undefined && saved > version;
  return { behind: saving > 0 || reloadDue, reloadDue };
}
