import { describe, expect, it } from "vitest";
import { addDays } from "@mbe/availability";
import { saveRegularWeek } from "../availability/superseded-fixtures.js";
import type {
  AvailabilityConfig,
  DateRule,
  FloorPlan,
  FloorPlanSection,
  Table,
  VenueSettings,
} from "@mbe/types";
import {
  buildSetupTree,
  type SetupAction,
  type SetupGroup,
  type SetupNode,
  type SetupTree,
  type SetupTreeInput,
} from "./setup-tree.js";

const TODAY = "2026-11-07";

const EMPTY_CONFIG: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

const HOURS = {
  opensAt: 690,
  lastSeatingAt: 810,
  closesAt: 870,
  seating: { version: 1 as const, interval: 15 },
  bookingTypes: ["online" as const, "phone" as const],
  dayHours: { version: 1 as const, sets: [] },
};

/** Regular week with Lunch (Tue-Fri) and Dinner (Tue-Sat). */
const REGULAR_WEEK: AvailabilityConfig = {
  ...EMPTY_CONFIG,
  schedules: [{ id: "sch-reg", name: "Regular week", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-reg",
      venueServiceId: "vs-lunch",
      ...HOURS,
      weekdays: [2, 3, 4, 5],
    },
    {
      id: "ss-2",
      scheduleId: "sch-reg",
      venueServiceId: "vs-dinner",
      ...HOURS,
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      weekdays: [2, 3, 4, 5, 6],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-reg", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
};

const SUMMER_HOURS: AvailabilityConfig = {
  ...REGULAR_WEEK,
  schedules: [
    ...REGULAR_WEEK.schedules,
    { id: "sch-sum", name: "Summer hours", kind: "alternate", isRegular: false },
  ],
  scheduleServices: [
    ...REGULAR_WEEK.scheduleServices,
    {
      id: "ss-3",
      scheduleId: "sch-sum",
      venueServiceId: "vs-dinner",
      ...HOURS,
      weekdays: [],
    },
  ],
  assignments: [
    ...REGULAR_WEEK.assignments,
    {
      id: "as-2",
      scheduleId: "sch-sum",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startsOn: "2027-06-01",
      endsOn: "2027-09-15",
      precedence: 1,
    },
  ],
};

function plan(id: string, name: string): FloorPlan {
  return {
    id,
    venueId: "venue-1",
    name,
    isActive: true,
    layoutJson: { width: 800, height: 600 } as FloorPlan["layoutJson"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function section(
  id: string,
  name: string,
  floorPlanId = "fp-1",
  displayOrder = 0
): FloorPlanSection {
  return {
    id,
    venueId: "venue-1",
    floorPlanId,
    name,
    color: "#fff",
    displayOrder,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function table(
  id: string,
  name: string,
  sectionId: string | null,
  extra: Partial<Table> = {}
): Table {
  return {
    id,
    name,
    tableNumber: null,
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: "fp-1",
    sectionId,
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...extra,
  } as Table;
}

function closure(id: string, startsOn: string, extra: Partial<DateRule> = {}): DateRule {
  return {
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn,
    endsOn: startsOn,
    ...extra,
  } as DateRule;
}

const BASE: SetupTreeInput = {
  venueName: "Bistro 42",
  isManager: true,
  readiness: "operational",
  today: TODAY,
  serviceDate: TODAY,
  open: { status: "ready", data: { config: EMPTY_CONFIG, settings: null } },
  sit: { status: "ready", data: { floorPlans: [], sections: [], tables: [] } },
};

function input(overrides: Partial<SetupTreeInput> = {}): SetupTreeInput {
  return { ...BASE, ...overrides };
}

function openOf(config: AvailabilityConfig, settings: VenueSettings | null = null) {
  return { status: "ready" as const, data: { config, settings } };
}

function sitOf(floorPlans: FloorPlan[], sections: FloorPlanSection[], tables: Table[]) {
  return { status: "ready" as const, data: { floorPlans, sections, tables } };
}

function group(tree: SetupTree, id: SetupGroup["id"]): SetupGroup {
  const found = tree.groups.find((g) => g.id === id);
  if (!found) throw new Error(`no group ${id}`);
  return found;
}

function find(nodes: readonly SetupNode[], id: string): SetupNode {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = findOrNull(node.children, id);
    if (inner) return inner;
  }
  throw new Error(`no node ${id}`);
}

function findOrNull(nodes: readonly SetupNode[], id: string): SetupNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = findOrNull(node.children, id);
    if (inner) return inner;
  }
  return null;
}

function walk(nodes: readonly SetupNode[]): SetupNode[] {
  return nodes.flatMap((n) => [n, ...walk(n.children)]);
}

const ids = (actions: readonly SetupAction[]) => actions.map((a) => a.id);

describe("buildSetupTree: an empty venue", () => {
  const tree = buildSetupTree(input());
  const open = group(tree, "open").nodes;
  const sit = group(tree, "sit").nodes;

  it("names the venue and has the two groups in order", () => {
    expect(tree.venueName).toBe("Bistro 42");
    expect(tree.groups.map((g) => g.id)).toEqual(["open", "sit"]);
  });

  it("marks every criterion-1 node 'not set up'", () => {
    const kinds = [...open, ...sit].map((n) => [n.kind, n.state.kind]);
    expect(kinds).toEqual([
      ["schedules", "unset"],
      ["specialDates", "unset"],
      ["booking", "unset"],
      ["floorPlan", "unset"],
    ]);
  });

  it("shows no sections or tables below an unset floor plan", () => {
    expect(sit[0]?.children).toEqual([]);
  });

  it("offers the one editor for each unset node to a Manager", () => {
    expect(ids(find(open, "schedules").actions)).toEqual(["setUpRegularWeek"]);
    expect(ids(find(open, "special-dates").actions)).toEqual(["openCalendar", "openSpecialDates"]);
    expect(ids(find(open, "booking").actions)).toEqual(["bookingRules"]);
    expect(ids(find(sit, "floor-plan-empty").actions)).toEqual(["addFloorPlan"]);
  });

  it("points the actions at the existing editors", () => {
    const hrs = find(open, "schedules").actions[0];
    expect(hrs?.target).toEqual({ kind: "link", to: "/availability?from=setup" });
    // The same address the Availability hub's row 5 opens, with the way back to Venue Setup.
    expect(find(open, "booking").actions[0]?.target).toEqual({
      kind: "link",
      to: "/availability/booking-rules?from=setup",
    });
    expect(find(sit, "floor-plan-empty").actions[0]?.target).toEqual({
      kind: "link",
      to: "/floor-plans",
    });
  });
});

describe("buildSetupTree: schedules and services", () => {
  it("nests venue → schedules → schedule → services, services in venue order", () => {
    const tree = buildSetupTree(input({ open: openOf(REGULAR_WEEK) }));
    const schedules = find(group(tree, "open").nodes, "schedules");
    expect(schedules.state).toEqual({ kind: "count", count: 1 });
    const [week] = schedules.children;
    expect(week).toMatchObject({ kind: "schedule", name: "Regular week" });
    expect(week?.state).toEqual({ kind: "week", weekdays: [2, 3, 4, 5, 6] });
    expect(week?.children.map((c) => [c.kind, c.name])).toEqual([
      ["service", "Lunch"],
      ["service", "Dinner"],
    ]);
    expect(week?.children[0]?.state).toEqual({
      kind: "service",
      opensAt: 690,
      lastSeatingAt: 810,
      closesAt: 870,
      weekdays: [2, 3, 4, 5],
      changes: [],
    });
  });

  it("keeps the schedule level for a one-schedule venue", () => {
    const tree = buildSetupTree(input({ open: openOf(REGULAR_WEEK) }));
    const schedules = find(group(tree, "open").nodes, "schedules");
    expect(schedules.children).toHaveLength(1);
    expect(schedules.children[0]?.kind).toBe("schedule");
  });

  it("gives a service with no weekdays the days its schedule covers", () => {
    const tree = buildSetupTree(input({ open: openOf(SUMMER_HOURS) }));
    const summer = find(group(tree, "open").nodes, "schedule:sch-sum");
    expect(summer.children[0]?.state).toMatchObject({
      kind: "service",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("describes a dated schedule by its period", () => {
    const tree = buildSetupTree(input({ open: openOf(SUMMER_HOURS) }));
    const summer = find(group(tree, "open").nodes, "schedule:sch-sum");
    expect(summer.state).toEqual({
      kind: "period",
      startsOn: "2027-06-01",
      endsOn: "2027-09-15",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("treats a regular schedule with no services as not set up", () => {
    const config: AvailabilityConfig = { ...EMPTY_CONFIG, schedules: REGULAR_WEEK.schedules };
    const tree = buildSetupTree(input({ open: openOf(config) }));
    expect(find(group(tree, "open").nodes, "schedules").state.kind).toBe("unset");
  });

  it("skips archived schedules and services", () => {
    const config: AvailabilityConfig = {
      ...SUMMER_HOURS,
      schedules: SUMMER_HOURS.schedules.map((s) =>
        s.id === "sch-sum" ? { ...s, archivedAt: "2026-10-01T00:00:00Z" } : s
      ),
      venueServices: SUMMER_HOURS.venueServices.map((s) =>
        s.id === "vs-lunch" ? { ...s, archivedAt: "2026-10-01T00:00:00Z" } : s
      ),
    };
    const tree = buildSetupTree(input({ open: openOf(config) }));
    const schedules = find(group(tree, "open").nodes, "schedules");
    expect(schedules.state).toEqual({ kind: "count", count: 1 });
    expect(schedules.children[0]?.children.map((c) => c.name)).toEqual(["Dinner"]);
  });

  it("neither counts nor lists the regular weeks that later saves replaced (#8688)", () => {
    const saved = [1, 2, 3].reduce(
      (config, run) => saveRegularWeek(config, TODAY, `run${run}`),
      REGULAR_WEEK
    );
    const tree = buildSetupTree(input({ open: openOf(saved) }));
    const schedules = find(group(tree, "open").nodes, "schedules");
    const regular = saved.schedules.find((s) => s.isRegular)!;
    expect(schedules.state).toEqual({ kind: "count", count: 1 });
    expect(schedules.children.map((c) => c.id)).toEqual([`schedule:${regular.id}`]);
  });

  it("still lists a replaced week on the service date it last runs", () => {
    const saved = saveRegularWeek(REGULAR_WEEK, TODAY);
    // At 00:30 on an overnight venue the service date is still yesterday, the old week's last day.
    const tree = buildSetupTree(input({ open: openOf(saved), serviceDate: addDays(TODAY, -1) }));
    expect(find(group(tree, "open").nodes, "schedules").state).toEqual({
      kind: "count",
      count: 2,
    });
  });

  it("offers change/edit on the regular week and edit-only on another schedule", () => {
    const tree = buildSetupTree(input({ open: openOf(SUMMER_HOURS) }));
    const open = group(tree, "open").nodes;
    expect(ids(find(open, "schedules").actions)).toEqual(["compareServices", "createSchedule"]);
    expect(ids(find(open, "schedule:sch-reg").actions)).toEqual([
      "changeRegularWeek",
      "editSchedule",
    ]);
    expect(ids(find(open, "schedule:sch-sum").actions)).toEqual(["editSchedule"]);
    expect(find(open, "schedule:sch-sum").actions[0]?.target).toEqual({
      kind: "link",
      to: "/availability/calendar?tab=schedules&from=setup",
    });
    // Change regular week is a link to Regular hours, where the week is edited (E4.4).
    for (const changeOrEdit of find(open, "schedule:sch-reg").actions) {
      expect(changeOrEdit.target).toEqual({ kind: "link", to: "/availability/hours?from=setup" });
    }
    // Add a schedule… opens the seeded editor there.
    expect(find(open, "schedules").actions[1]?.target).toEqual({
      kind: "link",
      to: "/availability/calendar?tab=schedules&action=addSchedule&from=setup",
    });
  });
});

describe("buildSetupTree: special dates and their targets", () => {
  const rules: DateRule[] = [
    closure("r-past", "2026-10-01", { endsOn: "2026-10-02" }),
    closure("r-3", "2026-12-31", { targetKind: "service", venueServiceId: "vs-dinner" }),
    closure("r-1", "2026-12-24", { targetKind: "tables", sectionId: "sec-bar", tableIds: ["t-1"] }),
    closure("r-2", "2026-12-26", { targetKind: "booking", bookingTypes: ["online", "phone"] }),
    closure("r-4", "2027-01-01"),
    closure("r-5", "2027-01-02", { targetKind: "tables", tableIds: ["t-1", "t-2"] }),
    closure("r-6", "2027-01-03"),
    {
      id: "r-open-ended",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-09-01",
      endsOn: null,
    } as DateRule,
  ];
  const sit = sitOf(
    [plan("fp-1", "Main")],
    [section("sec-bar", "Bar")],
    [table("t-1", "B1", "sec-bar")]
  );
  const config: AvailabilityConfig = { ...REGULAR_WEEK, dateRules: rules };
  const tree = buildSetupTree(input({ open: openOf(config), sit }));
  const node = find(group(tree, "open").nodes, "special-dates");

  it("counts upcoming rows, leaving out finished ones", () => {
    expect(node.state).toEqual({ kind: "count", count: 7 });
  });

  it("lists the next five in date order, an open-ended rule first", () => {
    expect(node.children.map((c) => c.id)).toEqual([
      "special-date:r-open-ended",
      "special-date:r-1",
      "special-date:r-2",
      "special-date:r-3",
      "special-date:r-4",
    ]);
  });

  it("names each target: venue, service, section, booking channels, tables", () => {
    const state = (id: string) => find(node.children, `special-date:${id}`).state;
    expect(state("r-4")).toMatchObject({ target: { kind: "venue" } });
    expect(state("r-3")).toMatchObject({ target: { kind: "service", name: "Dinner" } });
    expect(state("r-1")).toMatchObject({ target: { kind: "section", name: "Bar" } });
    expect(state("r-2")).toMatchObject({
      target: { kind: "booking", bookingTypes: ["online", "phone"] },
    });
    const withTables = buildSetupTree(
      input({ open: openOf({ ...REGULAR_WEEK, dateRules: [rules[5] as DateRule] }), sit })
    );
    expect(find(group(withTables, "open").nodes, "special-date:r-5").state).toMatchObject({
      target: { kind: "tables", count: 2 },
    });
  });

  it("reads a section closure's name as unknown until the floor plan group has loaded", () => {
    const loading = buildSetupTree(
      input({
        open: openOf({ ...REGULAR_WEEK, dateRules: [rules[2] as DateRule] }),
        sit: { status: "loading" },
      })
    );
    expect(find(group(loading, "open").nodes, "special-date:r-1").state).toMatchObject({
      target: { kind: "section", name: null },
    });
  });

  it("leaves hours-only rules out of the closure kinds and lists special hours", () => {
    const special: DateRule = {
      id: "r-sh",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-24",
      payload: { version: 1, services: [] },
    };
    const skip: DateRule = {
      id: "r-skip",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2026-12-25",
    };
    const t = buildSetupTree(
      input({ open: openOf({ ...REGULAR_WEEK, dateRules: [special, skip] }) })
    );
    const n = find(group(t, "open").nodes, "special-dates");
    expect(n.children.map((c) => c.state)).toMatchObject([
      { kind: "closure", what: "specialHours" },
    ]);
  });

  it("opens the calendar and the Special dates tab", () => {
    expect(node.actions.map((a) => a.target)).toEqual([
      { kind: "link", to: "/availability/calendar?tab=calendar&from=setup" },
      { kind: "link", to: "/availability/calendar?tab=special&from=setup" },
    ]);
  });
});

describe("buildSetupTree: booking", () => {
  it("shows the rules the venue has set", () => {
    const settings = {
      maxAdvanceBooking: 60,
      minAdvanceBooking: 2,
      maxPartySize: 8,
    } as VenueSettings;
    const tree = buildSetupTree(input({ open: openOf(EMPTY_CONFIG, settings) }));
    expect(find(group(tree, "open").nodes, "booking").state).toEqual({
      kind: "rules",
      daysAhead: 60,
      noticeHours: 2,
      largestParty: 8,
    });
  });

  it("is set up when any one rule is set, and keeps the others null", () => {
    const settings = { maxPartySize: 6 } as VenueSettings;
    const tree = buildSetupTree(input({ open: openOf(EMPTY_CONFIG, settings) }));
    expect(find(group(tree, "open").nodes, "booking").state).toEqual({
      kind: "rules",
      daysAhead: null,
      noticeHours: null,
      largestParty: 6,
    });
  });

  it("counts upcoming closures per channel", () => {
    const rules: DateRule[] = [
      closure("c1", "2026-12-01", { targetKind: "booking", bookingTypes: ["online"] }),
      closure("c2", "2026-12-02", { targetKind: "booking", bookingTypes: ["online", "waitlist"] }),
      closure("c3", "2026-01-02", { targetKind: "booking", bookingTypes: ["phone"] }),
    ];
    const tree = buildSetupTree(input({ open: openOf({ ...REGULAR_WEEK, dateRules: rules }) }));
    const booking = find(group(tree, "open").nodes, "booking");
    expect(booking.children.map((c) => [c.id, c.state])).toEqual([
      ["channel:online", { kind: "count", count: 2 }],
      ["channel:phone", { kind: "count", count: 0 }],
      ["channel:waitlist", { kind: "count", count: 1 }],
    ]);
  });
});

describe("buildSetupTree: floor plan, sections and tables", () => {
  const plans = [plan("fp-1", "Main floor")];
  const sections = [
    section("sec-main", "Main Dining", "fp-1", 1),
    section("sec-bar", "Bar", "fp-1", 0),
  ];
  const tables = [
    table("t-1", "B1", "sec-bar", { capacity: 2 }),
    table("t-2", "B2", "sec-bar"),
    table("t-3", "M1", "sec-main"),
    table("t-4", "Loose", null),
    table("t-5", "Gone", "sec-bar", { isActive: false }),
    table("t-6", "Elsewhere", "sec-bar", { floorPlanId: "fp-2" }),
  ];
  const tree = buildSetupTree(input({ sit: sitOf(plans, sections, tables) }));
  const sit = group(tree, "sit").nodes;
  const fp = find(sit, "floor-plan:fp-1");

  it("nests floor plan → sections (display order) → tables", () => {
    expect(fp.state).toEqual({ kind: "floorPlan", sections: 2, tables: 4 });
    expect(fp.children.map((c) => [c.kind, c.name])).toEqual([
      ["section", "Bar"],
      ["section", "Main Dining"],
      ["noSection", null],
    ]);
    const bar = find(sit, "section:sec-bar");
    expect(bar.state).toEqual({ kind: "tables", count: 2 });
    expect(bar.children.map((c) => [c.kind, c.name, c.state])).toEqual([
      ["table", "B1", { kind: "seats", seats: 2 }],
      ["table", "B2", { kind: "seats", seats: 4 }],
    ]);
  });

  it("lists No section only when an active table of the plan has no section", () => {
    expect(find(sit, "no-section:fp-1").state).toEqual({ kind: "tables", count: 1 });
    const without = buildSetupTree(
      input({
        sit: sitOf(
          plans,
          sections,
          tables.filter((t) => t.sectionId)
        ),
      })
    );
    expect(findOrNull(group(without, "sit").nodes, "no-section:fp-1")).toBeNull();
  });

  it("gives No section a Move to a section link to its floor plan", () => {
    expect(find(sit, "no-section:fp-1").actions).toMatchObject([
      { id: "moveToSection", target: { kind: "link", to: "/floor-plans/fp-1" } },
    ]);
  });

  it("opens the floor plan, adds another, and closes a section for a date", () => {
    expect(fp.actions.map((a) => [a.id, a.target])).toEqual([
      ["openFloorPlan", { kind: "link", to: "/floor-plans/fp-1" }],
      ["addFloorPlan", { kind: "link", to: "/floor-plans" }],
    ]);
    expect(find(sit, "section:sec-bar").actions).toMatchObject([
      {
        id: "closeSection",
        subject: "Bar",
        target: { kind: "link", to: "/availability/calendar?closeSection=sec-bar&from=setup" },
      },
    ]);
  });

  it("shows one node per floor plan", () => {
    const two = buildSetupTree(
      input({ sit: sitOf([...plans, plan("fp-2", "Terrace")], sections, tables) })
    );
    const nodes = group(two, "sit").nodes;
    expect(nodes.map((n) => n.id)).toEqual(["floor-plan:fp-1", "floor-plan:fp-2"]);
    expect(find(nodes, "floor-plan:fp-2").state).toEqual({
      kind: "floorPlan",
      sections: 0,
      tables: 1,
    });
  });
});

describe("buildSetupTree: Host variant", () => {
  it("carries no action on any node, set up or not", () => {
    const host = buildSetupTree(
      input({
        isManager: false,
        open: openOf({ ...SUMMER_HOURS, dateRules: [closure("r1", "2026-12-24")] }),
        sit: sitOf([plan("fp-1", "Main")], [section("sec-bar", "Bar")], [table("t-1", "B1", null)]),
      })
    );
    const everyNode = tree(host);
    expect(everyNode.length).toBeGreaterThan(10);
    expect(everyNode.flatMap((n) => n.actions)).toEqual([]);
    const emptyHost = buildSetupTree(input({ isManager: false }));
    expect(tree(emptyHost).flatMap((n) => n.actions)).toEqual([]);
    expect(emptyHost.groups.flatMap((g) => g.nodes).every((n) => n.state.kind === "unset")).toBe(
      true
    );
  });

  function tree(t: SetupTree) {
    return walk(t.groups.flatMap((g) => g.nodes));
  }
});

describe("buildSetupTree: the primary action before launch", () => {
  const primaries = (tree: SetupTree) =>
    walk(tree.groups.flatMap((g) => g.nodes)).flatMap((n) =>
      n.actions.filter((a) => a.primary).map((a) => `${n.id}:${a.id}`)
    );

  it("is the regular week's Set up button on an empty setup venue", () => {
    expect(primaries(buildSetupTree(input({ readiness: "setup" })))).toEqual([
      "schedules:setUpRegularWeek",
    ]);
  });

  it("moves to Add floor plan once the regular week is set", () => {
    const tree = buildSetupTree(input({ readiness: "setup", open: openOf(REGULAR_WEEK) }));
    expect(primaries(tree)).toEqual(["floor-plan-empty:addFloorPlan"]);
  });

  it("is absent when every gate is set, and once the venue is operational", () => {
    const sit = sitOf([plan("fp-1", "Main")], [], [table("t-1", "B1", null)]);
    expect(
      primaries(buildSetupTree(input({ readiness: "setup", open: openOf(REGULAR_WEEK), sit })))
    ).toEqual([]);
    expect(primaries(buildSetupTree(input({ readiness: "operational" })))).toEqual([]);
  });

  it("is never offered to a Host", () => {
    expect(primaries(buildSetupTree(input({ readiness: "setup", isManager: false })))).toEqual([]);
  });
});

describe("buildSetupTree: per-group loading and errors", () => {
  it("passes a failed group's error through and still builds the other", () => {
    const error = new Error("boom");
    const tree = buildSetupTree(
      input({ open: openOf(REGULAR_WEEK), sit: { status: "error", error } })
    );
    expect(group(tree, "sit")).toMatchObject({ load: { status: "error", error }, nodes: [] });
    expect(group(tree, "open").load.status).toBe("ready");
    expect(group(tree, "open").nodes.length).toBeGreaterThan(0);
  });

  it("builds no nodes while a group loads", () => {
    const tree = buildSetupTree(input({ open: { status: "loading" } }));
    expect(group(tree, "open")).toMatchObject({ load: { status: "loading" }, nodes: [] });
    expect(group(tree, "sit").nodes.length).toBeGreaterThan(0);
  });

  it("does not mutate its input", () => {
    const frozen = Object.freeze({ ...REGULAR_WEEK });
    expect(() => buildSetupTree(input({ open: openOf(frozen) }))).not.toThrow();
  });
});

describe("buildSetupTree: launch gates match venue readiness", () => {
  const primaries = (tree: SetupTree) =>
    walk(tree.groups.flatMap((g) => g.nodes)).flatMap((n) =>
      n.actions.filter((a) => a.primary).map((a) => `${n.id}:${a.id}`)
    );
  const tableless = sitOf([plan("fp-1", "Main")], [section("sec-bar", "Bar")], []);

  it("treats a floor plan with no active table as not set up, and makes it the primary step", () => {
    const tree = buildSetupTree(
      input({ readiness: "setup", open: openOf(REGULAR_WEEK), sit: tableless })
    );
    const fp = find(group(tree, "sit").nodes, "floor-plan:fp-1");
    expect(fp.state.kind).toBe("unset");
    expect(fp.children.map((c) => c.id)).toEqual(["section:sec-bar"]);
    expect(primaries(tree)).toEqual(["floor-plan:fp-1:openFloorPlan"]);
  });

  it("counts a plan whose only tables are inactive as tableless", () => {
    const inactive = sitOf(
      [plan("fp-1", "Main")],
      [],
      [table("t-1", "B1", null, { isActive: false })]
    );
    const tree = buildSetupTree(input({ open: openOf(REGULAR_WEEK), sit: inactive }));
    expect(find(group(tree, "sit").nodes, "floor-plan:fp-1").state.kind).toBe("unset");
  });

  it("assigns no primary until both groups are ready", () => {
    expect(
      primaries(buildSetupTree(input({ readiness: "setup", open: { status: "loading" } })))
    ).toEqual([]);
    expect(
      primaries(buildSetupTree(input({ readiness: "setup", sit: { status: "loading" } })))
    ).toEqual([]);
    expect(
      primaries(
        buildSetupTree(
          input({ readiness: "setup", open: { status: "error", error: new Error("x") } })
        )
      )
    ).toEqual([]);
  });
});

describe("buildSetupTree: services with day-specific hours", () => {
  it("runs a service on its set's days too, and lists the different hours", () => {
    const config: AvailabilityConfig = {
      ...REGULAR_WEEK,
      scheduleServices: [
        {
          ...(REGULAR_WEEK.scheduleServices[1] as AvailabilityConfig["scheduleServices"][number]),
          weekdays: [2, 3, 4],
          dayHours: {
            version: 1,
            sets: [
              { weekdays: [5, 6], ...HOURS, opensAt: 1020, lastSeatingAt: 1320, closesAt: 1380 },
              { weekdays: [0], ...HOURS, opensAt: 1020, lastSeatingAt: 1260, closesAt: 1400 },
            ],
          },
        },
        REGULAR_WEEK.scheduleServices[0] as AvailabilityConfig["scheduleServices"][number],
      ],
    };
    const tree = buildSetupTree(input({ open: openOf(config) }));
    const dinner = find(group(tree, "open").nodes, "service:sch-reg:vs-dinner");
    expect(dinner.state).toEqual({
      kind: "service",
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      weekdays: [0, 2, 3, 4, 5, 6],
      // The Sunday set only moves the closing; it is still a different day and is listed.
      changes: [
        { weekdays: [5, 6], opensAt: 1020, lastSeatingAt: 1320, closesAt: 1380 },
        { weekdays: [0], opensAt: 1020, lastSeatingAt: 1260, closesAt: 1400 },
      ],
    });
  });

  it("shows a per-day set that moves only the close", () => {
    const config: AvailabilityConfig = {
      ...REGULAR_WEEK,
      scheduleServices: REGULAR_WEEK.scheduleServices.map((row) =>
        row.venueServiceId === "vs-dinner"
          ? {
              ...row,
              dayHours: {
                version: 1 as const,
                sets: [
                  {
                    weekdays: [5, 6],
                    ...HOURS,
                    opensAt: row.opensAt,
                    lastSeatingAt: row.lastSeatingAt,
                    closesAt: row.closesAt + 60,
                  },
                ],
              },
            }
          : row
      ),
    };
    const tree = buildSetupTree(input({ open: openOf(config) }));
    const dinner = find(group(tree, "open").nodes, "service:sch-reg:vs-dinner");
    expect(dinner.state).toMatchObject({
      kind: "service",
      closesAt: 1320,
      changes: [{ weekdays: [5, 6], opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 }],
    });
  });
});
