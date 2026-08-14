/**
 * offline-cache — IndexedDB-backed key/value cache for "today's" reservations
 * and floor-plan snapshot.
 *
 * Foundation piece for the offline-first shell: later code writes to this
 * cache on a successful fetch/SSE snapshot, and reads from it on fetch
 * failure or cold boot while offline. Scoped strictly to "today" — every
 * entry is stamped with the date it was cached and `evictStaleEntries`
 * drops anything not matching the current date, keeping the store bounded.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Reservation, FloorPlan } from "@mbe/types";

export type FloorPlanSnapshot = FloorPlan[];

interface ReservationsCacheEntry {
  venueId: string;
  date: string;
  reservations: Reservation[];
}

interface FloorPlanCacheEntry {
  venueId: string;
  date: string;
  snapshot: FloorPlanSnapshot;
}

interface OfflineCacheSchema extends DBSchema {
  reservations: {
    key: string;
    value: ReservationsCacheEntry;
  };
  floorPlanSnapshots: {
    key: string;
    value: FloorPlanCacheEntry;
  };
}

const DB_NAME = "mbe-hospitality-offline";
const DB_VERSION = 1;
const RESERVATIONS_STORE = "reservations";
const FLOOR_PLAN_SNAPSHOTS_STORE = "floorPlanSnapshots";

let dbPromise: Promise<IDBPDatabase<OfflineCacheSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<OfflineCacheSchema>> {
  dbPromise ??= openDB<OfflineCacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(RESERVATIONS_STORE);
      db.createObjectStore(FLOOR_PLAN_SNAPSHOTS_STORE);
    },
  });
  return dbPromise;
}

function reservationsKey(venueId: string, date: string): string {
  return `${venueId}::${date}`;
}

/** Today's date as a `YYYY-MM-DD` key, using the current system clock. */
function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getCachedReservations(
  venueId: string,
  date: string
): Promise<Reservation[] | null> {
  const db = await getDb();
  const entry = await db.get(
    RESERVATIONS_STORE,
    reservationsKey(venueId, date)
  );
  return entry?.reservations ?? null;
}

export async function setCachedReservations(
  venueId: string,
  date: string,
  reservations: Reservation[]
): Promise<void> {
  const db = await getDb();
  const entry: ReservationsCacheEntry = { venueId, date, reservations };
  await db.put(RESERVATIONS_STORE, entry, reservationsKey(venueId, date));
}

export async function getCachedFloorPlanSnapshot(
  venueId: string
): Promise<FloorPlanSnapshot | null> {
  const db = await getDb();
  const entry = await db.get(FLOOR_PLAN_SNAPSHOTS_STORE, venueId);
  return entry?.snapshot ?? null;
}

export async function setCachedFloorPlanSnapshot(
  venueId: string,
  snapshot: FloorPlanSnapshot
): Promise<void> {
  const db = await getDb();
  const entry: FloorPlanCacheEntry = {
    venueId,
    date: todayDateKey(),
    snapshot,
  };
  await db.put(FLOOR_PLAN_SNAPSHOTS_STORE, entry, venueId);
}

export async function evictStaleEntries(today: string): Promise<void> {
  const db = await getDb();
  await Promise.all([
    evictStaleFromStore(db, RESERVATIONS_STORE, today),
    evictStaleFromStore(db, FLOOR_PLAN_SNAPSHOTS_STORE, today),
  ]);
}

async function evictStaleFromStore(
  db: IDBPDatabase<OfflineCacheSchema>,
  storeName: "reservations" | "floorPlanSnapshots",
  today: string
): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.date !== today) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
