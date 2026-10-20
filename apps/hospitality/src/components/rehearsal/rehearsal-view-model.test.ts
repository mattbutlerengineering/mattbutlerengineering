import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";
import { buildRehearsalView, minuteToIso, venueMidnightMs } from "./rehearsal-view-model";
import { foldEvents, rehearsalStateAt } from "./rehearsal-state";
import type { RehearsalEvent } from "./simulate-service";
import { minutesOfDayIn } from "../../utils/service-day";

const HAND: readonly RehearsalEvent[] = [
  { at: 1020, kind: "booked", partyId: "p1", size: 2, tableId: "a", startAt: 1080, endAt: 1140 },
  { at: 1020, kind: "booked", partyId: "p2", size: 4, tableId: "b", startAt: 1090, endAt: 1105 },
  { at: 1030, kind: "booked", partyId: "p4", size: 2, tableId: "d", startAt: 1200, endAt: 1260 },
  { at: 1080, kind: "seated", partyId: "p1", tableId: "a", size: 2, endAt: 1140 },
  { at: 1100, kind: "walk-in-waiting", partyId: "p6", size: 3 },
  { at: 1101, kind: "walk-in-waiting", partyId: "p5", size: 2 },
  { at: 1105, kind: "no-show", partyId: "p2", tableId: "b" },
  { at: 1112, kind: "seated", partyId: "p3", tableId: "c", size: 3, endAt: 1192 },
  { at: 1140, kind: "departed", partyId: "p1", tableId: "a" },
  { at: 1140, kind: "status-change", tableId: "a", to: "dirty" },
  { at: 1146, kind: "status-change", tableId: "a", to: "ready" },
];

const partyName = (size: number) => `Party of ${size}`;
const NOW = new Date("2026-10-19T20:07:33.000Z");
const IDS = ["a", "b", "c", "d"];

function view(minute: number, timeZone = "America/Los_Angeles") {
  return buildRehearsalView({
    state: rehearsalStateAt(HAND, minute),
    seed: 77,
    tableIds: IDS,
    now: NOW,
    timeZone,
    partyName,
  });
}

describe("reservations", () => {
  it("maps every party to a Reservation with null ids and no real-looking data", () => {
    const { reservations } = view(1141);
    const r: Reservation | undefined = reservations.find((x) => x.id === "rehearsal-77-1");
    expect(r).toBeDefined();
    const res = r as Reservation;
    expect(res.guestName).toBe("Party of 2");
    expect(res.partySize).toBe(2);
    expect(res.tableId).toBe("a");
    for (const key of [
      "guestId",
      "userId",
      "venueId",
      "guestEmail",
      "guestPhone",
      "notes",
      "occasion",
      "seatingPreference",
      "cancellationReason",
      "cancellationNote",
    ] as const) {
      expect(res[key], key).toBeNull();
    }
    expect(reservations.every((x) => /^rehearsal-77-\d+$/.test(x.id))).toBe(true);
  });

  it("maps phases to booking statuses", () => {
    const { reservations } = view(1141);
    const status = (id: string) => reservations.find((x) => x.id === id)?.status;
    expect(status("rehearsal-77-1")).toBe("COMPLETED");
    expect(status("rehearsal-77-2")).toBe("NO_SHOW");
    expect(status("rehearsal-77-4")).toBe("CONFIRMED");
    expect(status("rehearsal-77-3")).toBe("CONFIRMED");
  });

  it("gives a walk-in a block from its seating to its expected end", () => {
    const { reservations } = view(1120);
    const walkIn = reservations.find((x) => x.id === "rehearsal-77-3") as Reservation;
    expect(minutesOfDayIn(new Date(walkIn.startTime), "America/Los_Angeles")).toBe(1112);
    expect(minutesOfDayIn(new Date(walkIn.endTime), "America/Los_Angeles")).toBe(1192);
  });

  it("derives the venue date", () => {
    expect(view(1141).reservations[0]?.date).toBe("2026-10-19");
  });
});

describe("table statuses (UX amendment: ready is shown as available)", () => {
  it("uses only seated, needs-bussing and available", () => {
    const at = (m: number) => Object.fromEntries(view(m).tableStatuses);
    expect(at(1085)).toEqual({ a: "seated", b: "available", c: "available", d: "available" });
    expect(at(1140)).toEqual({ a: "needs-bussing", b: "available", c: "seated", d: "available" });
    // Simulator cycle 'ready' maps to 'available': the shared TableDisplayStatus has no 'ready'
    // (breakdown Notes, 2026-10-19 UX amendment).
    expect(at(1146).a).toBe("available");
    const used = new Set([...view(1146).tableStatuses.values()]);
    expect([...used].every((s) => ["seated", "needs-bussing", "available"].includes(s))).toBe(true);
  });

  it("lists exactly the seated parties", () => {
    expect([...view(1120).seatedIds].sort()).toEqual(["rehearsal-77-1", "rehearsal-77-3"]);
    expect(view(1141).seatedIds.has("rehearsal-77-1")).toBe(false);
  });
});

describe("waiting list", () => {
  it("is ordered by when each party started waiting", () => {
    const { waiting } = view(1101);
    expect(waiting.map((w) => w.sinceAt)).toEqual([1100, 1101]);
    expect(waiting.map((w) => w.size)).toEqual([3, 2]);
  });

  it("sorts by sinceAt even if the fold order differs", () => {
    const swapped: RehearsalEvent[] = [
      { at: 1101, kind: "walk-in-waiting", partyId: "p5", size: 2 },
      { at: 1100, kind: "walk-in-waiting", partyId: "p6", size: 3 },
    ];
    const v = buildRehearsalView({
      state: foldEvents(swapped, 2),
      seed: 1,
      tableIds: [],
      now: NOW,
      timeZone: "UTC",
      partyName,
    });
    expect(v.waiting.map((w) => w.sinceAt)).toEqual([1100, 1101]);
  });
});

describe("minutes to instants", () => {
  it.each(["America/Los_Angeles", "Asia/Kolkata", "UTC"])(
    "lands on the right wall-clock minute in %s",
    (tz) => {
      const midnight = venueMidnightMs(NOW, tz);
      for (const minute of [0, 1020, 1170, 1380]) {
        const iso = minuteToIso(midnight, minute);
        expect(minutesOfDayIn(new Date(iso), tz)).toBe(minute % 1440);
      }
    }
  );

  it("puts venue midnight at the start of the venue's day", () => {
    expect(new Date(venueMidnightMs(NOW, "America/Los_Angeles")).toISOString()).toBe(
      "2026-10-19T07:00:00.000Z"
    );
    expect(new Date(venueMidnightMs(NOW, "Asia/Kolkata")).toISOString()).toBe(
      "2026-10-19T18:30:00.000Z"
    );
  });
});
