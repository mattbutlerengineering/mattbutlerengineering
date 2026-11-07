import { describe, expect, it, vi } from "vitest";
import { resolveDay, validateConfig } from "@mbe/availability";
import type { PrismaClient } from "../generated/prisma/index.js";
import { readStoredConfig } from "../services/availability-config-rows.js";
import { getAllVenueIds } from "../services/lapsed-guest-cron.js";
import { collapseVenue, introducedIssues, runCollapse } from "./collapse-day-named-schedules.js";

vi.mock("../services/database.js", () => ({ db: { prisma: {} } }));
vi.mock("../services/lapsed-guest-cron.js", () => ({ getAllVenueIds: vi.fn() }));

interface Row {
  id: string;
  venueId: string;
  [key: string]: unknown;
}

interface VenueState {
  availabilityVersion: number;
  schedules: Row[];
  venueServices: Row[];
  scheduleServices: Row[];
  scheduleAssignments: Row[];
}

const SEATING = { version: 1, interval: 15 };
const serviceRow = (id: string, scheduleId: string, closesAt: number): Row => ({
  id,
  venueId: "v-1",
  scheduleId,
  venueServiceId: "vs-dinner",
  opensAt: 1020,
  lastSeatingAt: closesAt - 45,
  closesAt,
  seating: SEATING,
  bookingTypes: ["online", "phone"],
  weekdays: [],
  dayHours: { version: 1, sets: [] },
});

/** Regular Mon–Wed plus the old backfill's "Thu–Fri hours", as Backfill used to store it. */
const oldShape = (venueId: string): VenueState => ({
  availabilityVersion: 4,
  schedules: [
    {
      id: "regular",
      venueId,
      name: "Regular week",
      kind: "regular",
      isRegular: true,
      archivedAt: null,
    },
    {
      id: "thu-fri",
      venueId,
      name: "Thu–Fri hours",
      kind: "alternate",
      isRegular: false,
      archivedAt: null,
    },
  ],
  venueServices: [{ id: "vs-dinner", venueId, name: "Dinner", position: 0, archivedAt: null }],
  scheduleServices: [serviceRow("ss-reg", "regular", 1320), serviceRow("ss-alt", "thu-fri", 1380)],
  scheduleAssignments: [
    {
      id: "a-reg",
      venueId,
      scheduleId: "regular",
      weekdays: [1, 2, 3],
      startsOn: null,
      endsOn: null,
      precedence: 0,
    },
    {
      id: "a-alt",
      venueId,
      scheduleId: "thu-fri",
      weekdays: [4, 5],
      startsOn: null,
      endsOn: null,
      precedence: 0,
    },
  ],
});

/** An in-memory stand-in for the delegates the script touches; `writes` counts every mutating call. */
function fakePrisma(
  venues: Record<string, VenueState>,
  options: { failOn?: string; raceOn?: string } = {}
) {
  const writes = vi.fn();
  const forVenue = (where: { venueId?: string }) =>
    where.venueId ? venues[where.venueId] : undefined;
  const table = (
    key: "schedules" | "venueServices" | "scheduleServices" | "scheduleAssignments"
  ) => ({
    findMany: vi.fn(({ where }: { where: { venueId: string } }) =>
      Promise.resolve(forVenue(where)?.[key] ?? [])
    ),
    update: vi.fn(({ where, data }: { where: { id: string }; data: object }) => {
      writes(`${key}.update`);
      for (const v of Object.values(venues)) {
        v[key] = v[key].map((r) => (r.id === where.id ? { ...r, ...data } : r));
      }
      return Promise.resolve();
    }),
    create: vi.fn(({ data }: { data: Row }) => {
      writes(`${key}.create`);
      const v = venues[data.venueId];
      if (v) v[key] = [...v[key], data];
      return Promise.resolve();
    }),
    deleteMany: vi.fn(({ where }: { where: { venueId: string; id: { in: string[] } } }) => {
      writes(`${key}.deleteMany`);
      const v = forVenue(where);
      if (v) v[key] = v[key].filter((r) => !where.id.in.includes(r.id));
      return Promise.resolve();
    }),
  });
  let current = "";
  const tx = {
    $executeRaw: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
      current = String(values[0] ?? current);
      return Promise.resolve(1);
    }),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    venue: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        if (where.id === options.failOn) return Promise.reject(new Error("boom"));
        const v = venues[where.id];
        return Promise.resolve(v ? { availabilityVersion: v.availabilityVersion } : null);
      }),
      updateMany: vi.fn(({ where }: { where: { id: string; availabilityVersion: number } }) => {
        writes("venue.updateMany");
        const v = venues[where.id];
        if (
          !v ||
          where.id === options.raceOn ||
          v.availabilityVersion !== where.availabilityVersion
        ) {
          return Promise.resolve({ count: 0 });
        }
        v.availabilityVersion += 1;
        return Promise.resolve({ count: 1 });
      }),
    },
    schedule: table("schedules"),
    venueService: table("venueServices"),
    scheduleService: table("scheduleServices"),
    scheduleAssignment: table("scheduleAssignments"),
    dateRule: { findMany: vi.fn().mockResolvedValue([]) },
    availabilityChange: { create: vi.fn() },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx), $disconnect: vi.fn() };
  return { prisma: prisma as unknown as PrismaClient, tx, writes, current: () => current };
}

const NOW = new Date("2026-11-03T12:00:00.000Z");

describe("collapseVenue", () => {
  it("writes nothing in the default mode and reports what it would replace", async () => {
    const venues = { "v-1": oldShape("v-1") };
    const { prisma, writes } = fakePrisma(venues);

    const outcome = await collapseVenue(prisma, "v-1", { apply: false, now: NOW });

    expect(outcome.outcome).toBe("would_collapse");
    expect(writes).not.toHaveBeenCalled();
    expect(venues["v-1"].availabilityVersion).toBe(4);
    if (outcome.outcome !== "would_collapse") return;
    expect(outcome.replaced.scheduleServices).toEqual([expect.objectContaining({ id: "ss-reg" })]);
    expect(outcome.replaced.assignments).toEqual([
      expect.objectContaining({ id: "a-reg" }),
      expect.objectContaining({ id: "a-alt" }),
    ]);
    expect(outcome.replaced.schedules).toEqual([expect.objectContaining({ id: "thu-fri" })]);
  });

  it("logs the ids of the rows a collapse creates, so the log can be rolled back from", async () => {
    const state = oldShape("v-1");
    state.venueServices.push({
      id: "vs-brunch",
      venueId: "v-1",
      name: "Brunch",
      position: 1,
      archivedAt: null,
    });
    state.scheduleServices.push({
      ...serviceRow("ss-brunch", "thu-fri", 840),
      venueServiceId: "vs-brunch",
      opensAt: 600,
    });
    const venues = { "v-1": state };
    const { prisma } = fakePrisma(venues);

    const outcome = await collapseVenue(prisma, "v-1", { apply: true, now: NOW });

    if (outcome.outcome !== "collapsed") throw new Error(outcome.outcome);
    const created = venues["v-1"].scheduleServices.filter(
      (r) => r.venueServiceId === "vs-brunch" && r.scheduleId === "regular"
    );
    expect(created).toHaveLength(1);
    expect(outcome.created.scheduleServices).toEqual([created[0]?.id]);
  });

  it("applies the collapse in one transaction, bumps the version and is idempotent", async () => {
    const venues = { "v-1": oldShape("v-1") };
    const { prisma, tx } = fakePrisma(venues);
    const before = (await readStoredConfig(tx as never, "v-1")).config;

    const outcome = await collapseVenue(prisma, "v-1", { apply: true, now: NOW });

    expect(outcome.outcome).toBe("collapsed");
    expect(venues["v-1"].availabilityVersion).toBe(5);
    expect(tx.availabilityChange.create).not.toHaveBeenCalled();
    const v = venues["v-1"];
    expect(v.scheduleAssignments).toEqual([
      expect.objectContaining({ id: "a-reg", weekdays: [1, 2, 3, 4, 5] }),
    ]);
    expect(v.schedules.find((s) => s.id === "thu-fri")?.archivedAt).toEqual(NOW);
    expect(v.scheduleServices.filter((r) => r.scheduleId === "regular")).toEqual([
      expect.objectContaining({
        id: "ss-reg",
        closesAt: 1320,
        dayHours: {
          version: 1,
          sets: [expect.objectContaining({ weekdays: [4, 5], closesAt: 1380 })],
        },
      }),
    ]);

    const after = (await readStoredConfig(tx as never, "v-1")).config;
    expect(validateConfig(after).map((i) => i.code)).not.toContain("precedence_tie");
    for (const date of [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]) {
      const services = (config: typeof after) =>
        resolveDay({ timezone: "UTC", config }, date).services.map((s) => [
          s.venueServiceId,
          s.opensAt,
          s.closesAt,
        ]);
      expect(services(after)).toEqual(services(before));
    }

    const again = await collapseVenue(prisma, "v-1", { apply: true, now: NOW });
    expect(again.outcome).toBe("nothing_to_collapse");
    expect(venues["v-1"].availabilityVersion).toBe(5);
  });

  it("reports a missed compare-and-set as raced and writes no rows", async () => {
    const venues = { "v-1": oldShape("v-1") };
    const { prisma, writes } = fakePrisma(venues, { raceOn: "v-1" });

    const outcome = await collapseVenue(prisma, "v-1", { apply: true, now: NOW });

    expect(outcome.outcome).toBe("raced");
    expect(writes.mock.calls.flat()).toEqual(["venue.updateMany"]);
    expect(venues["v-1"].scheduleAssignments).toHaveLength(2);
  });
});

describe("introducedIssues", () => {
  const issue = (code: string, path: string) => ({ code, path, message: `${code} at ${path}` });

  it("reports an issue the collapse adds even when it also fixes one (equal counts)", () => {
    const before = [issue("close_before_open", "scheduleServices[0].closesAt")];
    const after = [issue("overlap", "scheduleServices[1].opensAt")];

    expect(introducedIssues(before as never, after as never)).toEqual(after);
  });

  it("reports nothing when the collapse only keeps or removes issues", () => {
    const kept = issue("overlap", "scheduleServices[1].opensAt");
    const fixed = issue("close_before_open", "scheduleServices[0].closesAt");

    expect(introducedIssues([kept, fixed] as never, [kept] as never)).toEqual([]);
    expect(introducedIssues([kept] as never, [] as never)).toEqual([]);
  });
});

describe("runCollapse", () => {
  it("keeps going past a venue that errors, logs each venue's replaced rows and counts outcomes", async () => {
    vi.mocked(getAllVenueIds).mockResolvedValueOnce(["v-bad", "v-1", "v-none"]);
    const { prisma } = fakePrisma({ "v-1": oldShape("v-1") }, { failOn: "v-bad" });
    const lines: string[] = [];

    const summary = await runCollapse(prisma, { apply: true }, (line) => lines.push(line));

    expect(summary.errors).toEqual([{ venueId: "v-bad", message: "boom" }]);
    expect(summary.counts).toEqual({ collapsed: 1, not_found: 1 });
    expect(summary.venues).toBe(3);
    const collapsed = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l.venueId === "v-1");
    expect(collapsed).toMatchObject({
      outcome: "collapsed",
      replaced: { scheduleServices: [expect.objectContaining({ id: "ss-reg" })] },
    });
  });

  it("has no error to exit on when every venue succeeds", async () => {
    vi.mocked(getAllVenueIds).mockResolvedValueOnce(["v-1"]);
    const { prisma } = fakePrisma({ "v-1": oldShape("v-1") });

    const summary = await runCollapse(prisma, { apply: false }, () => {});

    expect(summary).toMatchObject({ apply: false, errors: [], counts: { would_collapse: 1 } });
  });
});
