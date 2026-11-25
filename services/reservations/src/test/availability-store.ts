import { vi } from "vitest";
import { fakeStoreClient } from "./store-client.js";

/** An in-memory venue (one regular dinner schedule, two tables) behind the availability store fake. */
export interface Store {
  version: number;
  dateRules: Record<string, unknown>[];
  changes: Record<string, unknown>[];
}

export function availabilityStore(store: Store) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    store.changes = [...store.changes, data];
    return { id: `chg-${store.changes.length}` };
  });
  const { client, tx } = fakeStoreClient(
    {
      schedule: {
        findMany: vi.fn(async () => [
          {
            id: "sch-1",
            venueId: "v",
            name: "Regular",
            kind: "regular",
            isRegular: true,
            archivedAt: null,
          },
        ]),
      },
      venueService: {
        findMany: vi.fn(async () => [
          { id: "vs-dinner", venueId: "v", name: "Dinner", position: 0, archivedAt: null },
        ]),
      },
      scheduleService: {
        findMany: vi.fn(async () => [
          {
            id: "ss-1",
            venueId: "v",
            scheduleId: "sch-1",
            venueServiceId: "vs-dinner",
            opensAt: 1020,
            lastSeatingAt: 1260,
            closesAt: 1380,
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        ]),
      },
      scheduleAssignment: {
        findMany: vi.fn(async () => [
          {
            id: "as-1",
            venueId: "v",
            scheduleId: "sch-1",
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            startsOn: null,
            endsOn: null,
            precedence: 0,
          },
        ]),
      },
      dateRule: {
        findMany: vi.fn(async () => store.dateRules.map((r) => ({ tables: [], ...r }))),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          store.dateRules = [
            ...store.dateRules,
            { deletedAt: null, ...data, repeat: null, window: null },
          ];
        }),
        updateMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
          store.dateRules = store.dateRules.filter((r) => !where.id.in.includes(r["id"] as string));
          return { count: 1 };
        }),
      },
      dateRuleTable: { createMany: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({})) },
      venue: {
        findUnique: vi.fn(async () => ({
          ianaTimezone: "America/Los_Angeles",
          settings: {},
          operatingHours: null,
          availabilityVersion: store.version,
          hostEmergencyClose: false,
        })),
        updateMany: vi.fn(async ({ where }: { where: { availabilityVersion: number } }) => {
          if (where.availabilityVersion !== store.version) return { count: 0 };
          store.version += 1;
          return { count: 1 };
        }),
        update: vi.fn(async ({ data }: { data?: { availabilityVersion?: unknown } } = {}) => {
          if (data?.availabilityVersion) store.version += 1;
          return { availabilityVersion: store.version };
        }),
      },
      floorPlanSection: { findMany: vi.fn(async () => []) },
      reservation: { findMany: vi.fn(async () => []) },
      table: {
        findMany: vi.fn(async () => [
          { id: "t-1", isActive: true },
          { id: "t-2", isActive: true },
        ]),
      },
      availabilityChange: {
        findFirst: vi.fn(async () => store.changes.at(-1) ?? null),
        findMany: vi.fn(async () => []),
        create,
      },
    },
    {}
  );
  return { client, tx, create };
}
