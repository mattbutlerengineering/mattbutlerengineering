import { describe, expect, it } from "vitest";
import type { AvailabilityDaySummary, DateRule } from "@mbe/types";
import { todayLine, type TodayLineInput } from "./today-line.js";

const DATE = "2026-11-08";
const NOW = new Date("2026-11-08T20:00:00Z");
const WHOLE = { from: 0, to: 2880 };
const TO_CLOSE = 2880;

const LUNCH = {
  venueServiceId: "vs-l",
  name: "Lunch",
  opensAt: 690,
  lastSeatingAt: 870,
  closesAt: 900,
};
const DINNER = {
  venueServiceId: "vs-d",
  name: "Dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
};

function summary(over: Partial<AvailabilityDaySummary> = {}): AvailabilityDaySummary {
  return {
    serviceDate: DATE,
    label: "Regular week",
    scheduleId: "s1",
    serviceCount: 2,
    closures: [],
    bookingOpen: { online: true, phone: true, waitlist: true },
    services: [LUNCH, DINNER],
    ...over,
  };
}

function build(over: Partial<TodayLineInput> = {}) {
  return todayLine({
    serviceDate: DATE,
    summary: summary(),
    rules: [],
    now: NOW,
    serviceNames: new Map([
      ["vs-l", "Lunch"],
      ["vs-d", "Dinner"],
    ]),
    sectionNames: new Map([["sec-1", "Patio"]]),
    bannerShowsOnline: false,
    ...over,
  });
}

function tonight(id: string, extra: Record<string, unknown>): DateRule {
  return {
    id,
    kind: "tonight",
    targetKind: "venue",
    startsOn: DATE,
    endsOn: DATE,
    expiresAt: "2026-11-09T11:00:00.000Z",
    payload: { version: 1, pacing: { covers: 8 } },
    ...extra,
  } as DateRule;
}

describe("todayLine hours", () => {
  it("lists the open services in opening order", () => {
    const model = build({ summary: summary({ services: [DINNER, LUNCH] }) });
    expect(model.closed).toBe(false);
    expect(model.hours).toEqual([
      { name: "Lunch", opensAt: 690, closesAt: 900 },
      { name: "Dinner", opensAt: 1020, closesAt: 1320 },
    ]);
    expect(model.items).toEqual([]);
  });

  it("leaves out a service a whole-day closure covers and names it as an item", () => {
    const model = build({
      summary: summary({
        closures: [{ ruleId: "c1", targetKind: "service", venueServiceId: "vs-l", ...WHOLE }],
      }),
    });
    expect(model.hours.map((h) => h.name)).toEqual(["Dinner"]);
    expect(model.items).toEqual([{ kind: "serviceClosed", name: "Lunch" }]);
  });

  it("names a service the engine already dropped, from the config names", () => {
    const model = build({
      summary: summary({
        services: [DINNER],
        closures: [{ ruleId: "c1", targetKind: "service", venueServiceId: "vs-l", ...WHOLE }],
      }),
    });
    expect(model.items).toEqual([{ kind: "serviceClosed", name: "Lunch" }]);
  });

  it("reads a day with no open service as closed, without closure items", () => {
    const model = build({
      summary: summary({
        label: "Closed",
        services: [],
        serviceCount: 0,
        closures: [
          { ruleId: "c1", targetKind: "venue", ...WHOLE },
          { ruleId: "c2", targetKind: "booking", bookingTypes: ["online"], ...WHOLE },
        ],
      }),
    });
    expect(model.closed).toBe(true);
    expect(model.hours).toEqual([]);
    expect(model.items).toEqual([]);
  });

  it("reads the Closed label as closed even when services are still listed", () => {
    expect(build({ summary: summary({ label: "Closed" }) }).closed).toBe(true);
  });

  it("treats a whole-day venue band that kept the services as closed", () => {
    const model = build({
      summary: summary({ closures: [{ ruleId: "c1", targetKind: "venue", ...WHOLE }] }),
    });
    expect(model.closed).toBe(true);
    expect(model.hours).toEqual([]);
  });

  it("is not closed when an old API sends no services but counts some", () => {
    const { services: _omit, ...old } = summary();
    expect(build({ summary: old }).closed).toBe(false);
  });

  it("still shows night-of changes on a closed day", () => {
    const model = build({
      summary: summary({ label: "Closed", services: [], serviceCount: 0 }),
      rules: [tonight("t1", { payload: { version: 1, pacing: { covers: 8 } } })],
    });
    expect(model.items).toEqual([
      { kind: "tonight", change: { ruleId: "t1", kind: "pacing", covers: 8 } },
    ]);
  });
});

describe("todayLine closures", () => {
  it("a section closed all day is named by its section", () => {
    const model = build({
      summary: summary({
        closures: [{ ruleId: "c1", targetKind: "tables", sectionId: "sec-1", ...WHOLE }],
      }),
    });
    expect(model.items).toEqual([{ kind: "serviceClosed", name: "Patio" }]);
  });

  it("the venue closing from a time reads as closing early with no name", () => {
    const model = build({
      summary: summary({
        closures: [{ ruleId: "c1", targetKind: "venue", from: 1290, to: TO_CLOSE }],
      }),
    });
    expect(model.closed).toBe(false);
    expect(model.items).toEqual([{ kind: "closingEarly", at: 1290, name: null }]);
  });

  it("a service or section closing from a time names it", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "service", venueServiceId: "vs-d", from: 1290, to: TO_CLOSE },
          { ruleId: "c2", targetKind: "tables", sectionId: "sec-1", from: 1200, to: TO_CLOSE },
        ],
      }),
    });
    expect(model.items).toEqual([
      { kind: "closingEarly", at: 1290, name: "Dinner" },
      { kind: "closingEarly", at: 1200, name: "Patio" },
    ]);
  });

  it("a service band that runs from before its open to the close is closed, not early", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "service", venueServiceId: "vs-d", from: 1020, to: TO_CLOSE },
        ],
      }),
    });
    expect(model.items).toEqual([{ kind: "serviceClosed", name: "Dinner" }]);
    expect(model.hours.map((h) => h.name)).toEqual(["Lunch"]);
  });

  it("a section band covering the whole span of the day reads as closed", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "tables", sectionId: "sec-1", from: 600, to: TO_CLOSE },
        ],
      }),
    });
    expect(model.items).toEqual([{ kind: "serviceClosed", name: "Patio" }]);
  });

  it("ignores a section the config cannot name, and a tables band with no section", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c2", targetKind: "tables", sectionId: "gone", ...WHOLE },
          { ruleId: "c3", targetKind: "tables", ...WHOLE },
        ],
      }),
    });
    expect(model.items).toEqual([]);
  });

  it("shows a venue band that ends before the day's last close as a closed window", () => {
    const model = build({
      summary: summary({ closures: [{ ruleId: "c1", targetKind: "venue", from: 930, to: 1000 }] }),
    });
    expect(model.closed).toBe(false);
    expect(model.items).toEqual([{ kind: "closedBetween", name: null, from: 930, to: 1000 }]);
  });

  it("shows a bounded service or section band with its name", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "service", venueServiceId: "vs-l", from: 720, to: 780 },
          { ruleId: "c2", targetKind: "tables", sectionId: "sec-1", from: 1100, to: 1200 },
        ],
      }),
    });
    expect(model.items).toEqual([
      { kind: "closedBetween", name: "Lunch", from: 720, to: 780 },
      { kind: "closedBetween", name: "Patio", from: 1100, to: 1200 },
    ]);
  });

  it("shows a bounded booking band as paused between times", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "booking", bookingTypes: ["online"], from: 1080, to: 1140 },
        ],
      }),
    });
    expect(model.items).toEqual([
      { kind: "pausedBetween", channels: ["online"], from: 1080, to: 1140 },
    ]);
  });

  it("removes online from a bounded pause when the banner shows, and drops it if none is left", () => {
    const closures = [
      {
        ruleId: "c1",
        targetKind: "booking" as const,
        bookingTypes: ["online" as const, "phone" as const],
        from: 1080,
        to: 1140,
      },
      {
        ruleId: "c2",
        targetKind: "booking" as const,
        bookingTypes: ["online" as const],
        from: 1200,
        to: 1260,
      },
    ];
    const model = build({ summary: summary({ closures }), bannerShowsOnline: true });
    expect(model.items).toEqual([
      { kind: "pausedBetween", channels: ["phone"], from: 1080, to: 1140 },
    ]);
  });

  it("orders closed windows after the closing-early items and before pauses", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "booking", bookingTypes: ["phone"], ...WHOLE },
          { ruleId: "c2", targetKind: "venue", from: 930, to: 1000 },
          { ruleId: "c3", targetKind: "venue", from: 1300, to: TO_CLOSE },
          { ruleId: "c4", targetKind: "booking", bookingTypes: ["phone"], from: 1080, to: 1140 },
        ],
      }),
    });
    expect(model.items.map((i) => i.kind)).toEqual([
      "closingEarly",
      "closedBetween",
      "paused",
      "pausedBetween",
    ]);
  });

  it("a booking closure whole day pauses its channels with no start", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "booking", bookingTypes: ["online", "phone"], ...WHOLE },
        ],
      }),
    });
    expect(model.items).toEqual([{ kind: "paused", channels: ["online", "phone"], from: null }]);
  });

  it("a booking closure from a time carries the start", () => {
    const model = build({
      summary: summary({
        closures: [
          {
            ruleId: "c1",
            targetKind: "booking",
            bookingTypes: ["phone"],
            from: 1110,
            to: TO_CLOSE,
          },
        ],
      }),
    });
    expect(model.items).toEqual([{ kind: "paused", channels: ["phone"], from: 1110 }]);
  });

  it("orders items as the table does: closed, venue early, named early, paused, night-of", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "booking", bookingTypes: ["phone"], ...WHOLE },
          { ruleId: "c2", targetKind: "service", venueServiceId: "vs-d", from: 1290, to: TO_CLOSE },
          { ruleId: "c3", targetKind: "venue", from: 1300, to: TO_CLOSE },
          { ruleId: "c4", targetKind: "tables", sectionId: "sec-1", ...WHOLE },
        ],
      }),
      rules: [tonight("t1", { payload: { version: 1, closeAt: 1290 } })],
    });
    expect(model.items.map((i) => i.kind)).toEqual([
      "serviceClosed",
      "closingEarly",
      "closingEarly",
      "paused",
      "tonight",
    ]);
    expect(model.items[1]).toMatchObject({ name: null });
    expect(model.items[2]).toMatchObject({ name: "Dinner" });
  });

  it("does not read a night-of rule's own closure band as a closure", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "t1", targetKind: "venue", from: 1170, to: 1200 },
          { ruleId: "t2", targetKind: "booking", bookingTypes: ["online"], ...WHOLE },
        ],
      }),
      rules: [
        tonight("t1", { payload: { version: 1, stop: { from: 1170, to: 1200 } } }),
        tonight("t2", {
          targetKind: "booking",
          bookingTypes: ["online"],
          payload: { version: 1, stop: WHOLE },
        }),
      ],
    });
    expect(model.items.map((i) => i.kind)).toEqual(["tonight", "tonight"]);
  });
});

describe("todayLine night-of changes", () => {
  it("maps active rules to tonight items with the Timeline's change", () => {
    const model = build({ rules: [tonight("t1", { payload: { version: 1, closeAt: 1290 } })] });
    expect(model.items).toEqual([
      { kind: "tonight", change: { ruleId: "t1", kind: "close_early", closeAt: 1290 } },
    ]);
  });

  it("leaves out a rule past its expiry", () => {
    const model = build({
      rules: [
        tonight("t1", {
          payload: { version: 1, closeAt: 1290 },
          expiresAt: "2026-11-08T19:00:00.000Z",
        }),
      ],
    });
    expect(model.items).toEqual([]);
  });

  it("uses the service date it was given, so after midnight the running day's rule shows", () => {
    // 1:00 AM on Nov 9 in New York is still service day Nov 8.
    const model = build({
      now: new Date("2026-11-09T06:00:00Z"),
      rules: [tonight("t1", { payload: { version: 1, closeAt: 1500 } })],
    });
    expect(model.serviceDate).toBe(DATE);
    expect(model.items).toHaveLength(1);
  });

  it("ignores rules for another service date", () => {
    const model = build({
      rules: [tonight("t1", { startsOn: "2026-11-09", payload: { version: 1, closeAt: 1290 } })],
    });
    expect(model.items).toEqual([]);
  });
});

describe("todayLine said once", () => {
  const onlinePhone = summary({
    closures: [
      { ruleId: "c1", targetKind: "booking", bookingTypes: ["online", "phone"], ...WHOLE },
    ],
  });
  const pauseRule = tonight("t1", {
    targetKind: "booking",
    bookingTypes: ["online"],
    payload: { version: 1, stop: WHOLE },
  });

  it("keeps the online pause when no banner says it", () => {
    const model = build({ summary: onlinePhone, rules: [pauseRule] });
    expect(model.items).toEqual([
      { kind: "paused", channels: ["online", "phone"], from: null },
      { kind: "tonight", change: { ruleId: "t1", kind: "pause_online" } },
    ]);
  });

  it("drops the night-of online pause and the online channel when the banner is up", () => {
    const model = build({
      summary: summary({
        closures: [
          { ruleId: "c1", targetKind: "booking", bookingTypes: ["online", "phone"], ...WHOLE },
          { ruleId: "t1", targetKind: "booking", bookingTypes: ["online"], ...WHOLE },
        ],
      }),
      rules: [pauseRule],
      bannerShowsOnline: true,
    });
    expect(model.items).toEqual([{ kind: "paused", channels: ["phone"], from: null }]);
  });

  it("drops a paused item that has no channel left", () => {
    const model = build({
      summary: summary({
        closures: [{ ruleId: "c1", targetKind: "booking", bookingTypes: ["online"], ...WHOLE }],
      }),
      bannerShowsOnline: true,
    });
    expect(model.items).toEqual([]);
  });

  it("keeps two close-early items distinct in the model (the view dedupes by text)", () => {
    const model = build({
      summary: summary({
        closures: [{ ruleId: "c1", targetKind: "venue", from: 1290, to: TO_CLOSE }],
      }),
      rules: [tonight("t1", { payload: { version: 1, closeAt: 1290 } })],
    });
    expect(model.items.map((i) => i.kind)).toEqual(["closingEarly", "tonight"]);
  });
});
