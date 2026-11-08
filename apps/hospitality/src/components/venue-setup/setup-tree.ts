import type {
  AvailabilityConfig,
  DateRule,
  FloorPlan,
  FloorPlanSection,
  Schedule,
  Table,
  VenueSettings,
} from "@mbe/types";
import { availabilityPath } from "../availability/availability-entry.js";

/**
 * Venue Setup hub (architecture.md "Setup tree"): config, floor plans, sections, tables and
 * booking settings turned into one tree of nodes. Pure: plain data in, plain data out, no JSX and
 * no translated text; the page renders the words. Owns the nesting (venue → schedules → services;
 * venue → floor plan → sections → tables; special dates → their targets) and each node's state.
 */

/** How many upcoming special dates the hub lists before "Show all". */
const SPECIAL_DATES_SHOWN = 5;

const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
const CHANNELS = ["online", "phone", "waitlist"] as const;
export type Channel = (typeof CHANNELS)[number];

export type SetupNodeKind =
  | "schedules"
  | "schedule"
  | "service"
  | "specialDates"
  | "specialDate"
  | "booking"
  | "channel"
  | "floorPlan"
  | "section"
  | "noSection"
  | "table";

/** What a special date is aimed at; a section's name is `null` until the floor plan has loaded. */
export type ClosureTarget =
  | { readonly kind: "venue" }
  | { readonly kind: "service"; readonly name: string | null }
  | { readonly kind: "section"; readonly name: string | null }
  | { readonly kind: "booking"; readonly bookingTypes: readonly Channel[] }
  | { readonly kind: "tables"; readonly count: number };

/** A node's state: "not set up" or its current value or count. */
export type NodeState =
  | { readonly kind: "unset" }
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "week"; readonly weekdays: readonly number[] }
  | {
      readonly kind: "period";
      readonly startsOn: string | null;
      readonly endsOn: string | null;
      readonly weekdays: readonly number[];
    }
  | {
      readonly kind: "service";
      readonly opensAt: number;
      readonly lastSeatingAt: number;
      readonly weekdays: readonly number[];
    }
  | {
      readonly kind: "rules";
      readonly daysAhead: number | null;
      readonly noticeHours: number | null;
      readonly largestParty: number | null;
    }
  | {
      readonly kind: "closure";
      readonly what: "closed" | "specialHours";
      readonly startsOn: string;
      readonly endsOn: string | null;
      readonly target: ClosureTarget;
    }
  | { readonly kind: "floorPlan"; readonly sections: number; readonly tables: number }
  | { readonly kind: "tables"; readonly count: number }
  | { readonly kind: "seats"; readonly seats: number };

export type SetupActionId =
  | "setUpRegularWeek"
  | "changeRegularWeek"
  | "editSchedule"
  | "compareServices"
  | "createSchedule"
  | "openCalendar"
  | "openSpecialDates"
  | "bookingRules"
  | "openFloorPlan"
  | "addFloorPlan"
  | "closeSection"
  | "moveToSection";

/** Where an action goes: a route, or an existing editor the page opens in place. */
export type SetupActionTarget =
  | { readonly kind: "link"; readonly to: string }
  | { readonly kind: "dialog"; readonly dialog: "changeRegularWeek" | "bookingRules" };

export interface SetupAction {
  readonly id: SetupActionId;
  readonly target: SetupActionTarget;
  /** The button the Manager is steered to next, before launch. */
  readonly primary: boolean;
  /** The resource the action names, for its accessible name ("Close Bar for a date…"). */
  readonly subject?: string;
}

export interface SetupNode {
  readonly id: string;
  readonly kind: SetupNodeKind;
  /** The resource's own name; null when the kind's label is the name ("Special dates"). */
  readonly name: string | null;
  readonly state: NodeState;
  readonly actions: readonly SetupAction[];
  readonly children: readonly SetupNode[];
}

/** One group's read: each group of the hub loads and fails on its own. */
export type GroupLoad<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "ready"; readonly data: T };

export interface OpenData {
  readonly config: AvailabilityConfig;
  readonly settings: VenueSettings | null | undefined;
}

export interface SitData {
  readonly floorPlans: readonly FloorPlan[];
  readonly sections: readonly FloorPlanSection[];
  readonly tables: readonly Table[];
}

export interface SetupTreeInput {
  readonly venueName: string;
  readonly isManager: boolean;
  /** `setup` marks the first unset launch step as the primary action. */
  readonly readiness: "setup" | "operational";
  /** The venue's today, `YYYY-MM-DD`. */
  readonly today: string;
  readonly capabilities: {
    /** The Close dialog can open on a section; without it the section action is left out. */
    readonly closeSection: boolean;
  };
  readonly open: GroupLoad<OpenData>;
  readonly sit: GroupLoad<SitData>;
}

/** A group's read without its data: the page renders the data from `nodes`. */
export type GroupState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "ready" };

export interface SetupGroup {
  readonly id: "open" | "sit";
  readonly load: GroupState;
  readonly nodes: readonly SetupNode[];
}

export interface SetupTree {
  readonly venueName: string;
  readonly groups: readonly [SetupGroup, SetupGroup];
}

const UNSET: NodeState = { kind: "unset" };
const ready = { status: "ready" } as const;

type Link = { readonly kind: "link"; readonly to: string };
const link = (to: string): Link => ({ kind: "link", to });
const action = (id: SetupActionId, target: SetupActionTarget, subject?: string): SetupAction =>
  subject === undefined ? { id, target, primary: false } : { id, target, primary: false, subject };

const SETUP_CALENDAR = availabilityPath({ from: "setup" });
const SETUP_SCHEDULES = availabilityPath({ tab: "schedules", from: "setup" });
const SETUP_SPECIAL = availabilityPath({ tab: "special", from: "setup" });

/** Launch steps the Manager must finish; the first unset one becomes the primary button. */
const LAUNCH_GATES: ReadonlySet<string> = new Set(["schedules", "floor-plan-empty"]);

const latest = (dates: readonly (string | null | undefined)[]): string =>
  dates.reduce<string>((a, b) => (b && b > a ? b : a), "");

const sortedUnique = (days: readonly number[]): number[] =>
  [...new Set(days)].sort((a, b) => a - b);

const active = <T extends { readonly archivedAt?: string | null }>(rows: readonly T[]): T[] =>
  rows.filter((row) => !row.archivedAt);

// ── When you're open ────────────────────────────────────────────────────────

function scheduleNode(
  schedule: Schedule,
  config: AvailabilityConfig,
  services: ReadonlyMap<string, { readonly name: string; readonly position: number }>,
  manager: boolean
): SetupNode {
  const assignments = config.assignments.filter((a) => a.scheduleId === schedule.id);
  const covered =
    assignments.length > 0 ? sortedUnique(assignments.flatMap((a) => a.weekdays)) : ALL_WEEKDAYS;
  const rows = config.scheduleServices
    .filter((s) => s.scheduleId === schedule.id && services.has(s.venueServiceId))
    .sort(
      (a, b) =>
        (services.get(a.venueServiceId)?.position ?? 0) -
        (services.get(b.venueServiceId)?.position ?? 0)
    );
  const children: SetupNode[] = rows.map((row) => ({
    id: `service:${schedule.id}:${row.venueServiceId}`,
    kind: "service",
    name: services.get(row.venueServiceId)?.name ?? null,
    state: {
      kind: "service",
      opensAt: row.opensAt,
      lastSeatingAt: row.lastSeatingAt,
      weekdays: row.weekdays.length > 0 ? sortedUnique(row.weekdays) : [...covered],
    },
    actions: [],
    children: [],
  }));
  const weekdays = sortedUnique(
    children.flatMap((c) => (c.state.kind === "service" ? c.state.weekdays : []))
  );
  const dated = assignments.filter((a) => a.startsOn || a.endsOn);
  const starts = dated.map((a) => a.startsOn).filter((d): d is string => !!d);
  const ends = dated.map((a) => a.endsOn);
  const state: NodeState =
    !schedule.isRegular && dated.length > 0
      ? {
          kind: "period",
          startsOn: starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null,
          endsOn: ends.some((d) => !d) ? null : latest(ends),
          weekdays: covered.slice(),
        }
      : { kind: "week", weekdays };
  const actions: SetupAction[] = !manager
    ? []
    : schedule.isRegular
      ? [
          action("changeRegularWeek", { kind: "dialog", dialog: "changeRegularWeek" }),
          action("editSchedule", link(SETUP_SCHEDULES), schedule.name),
        ]
      : [action("editSchedule", link(SETUP_SCHEDULES), schedule.name)];
  return {
    id: `schedule:${schedule.id}`,
    kind: "schedule",
    name: schedule.name,
    state,
    actions,
    children,
  };
}

function schedulesNode(config: AvailabilityConfig, manager: boolean): SetupNode {
  const services = new Map(
    active(config.venueServices).map((s) => [s.id, { name: s.name, position: s.position }])
  );
  const schedules = active(config.schedules).map((s) => scheduleNode(s, config, services, manager));
  const regular = active(config.schedules).find((s) => s.isRegular);
  const regularSet =
    regular !== undefined &&
    schedules.some((n) => n.id === `schedule:${regular.id}` && n.children.length > 0);
  if (!regularSet) {
    return {
      id: "schedules",
      kind: "schedules",
      name: null,
      state: UNSET,
      actions: manager ? [action("setUpRegularWeek", link(SETUP_CALENDAR))] : [],
      children: [],
    };
  }
  return {
    id: "schedules",
    kind: "schedules",
    name: null,
    state: { kind: "count", count: schedules.length },
    actions: manager
      ? [
          action("compareServices", link(SETUP_SCHEDULES)),
          action("createSchedule", link(SETUP_SCHEDULES)),
        ]
      : [],
    children: schedules,
  };
}

/** Rules the hub lists: closures and special hours that have not finished. */
function upcomingRules(rules: readonly DateRule[], today: string): DateRule[] {
  return rules
    .filter((r) => r.kind === "closure" || r.kind === "special_hours")
    .filter((r) => r.endsOn == null || r.endsOn >= today)
    .sort((a, b) =>
      a.startsOn === b.startsOn ? a.id.localeCompare(b.id) : a.startsOn < b.startsOn ? -1 : 1
    );
}

function targetOf(
  rule: DateRule,
  services: ReadonlyMap<string, string>,
  sections: ReadonlyMap<string, string> | null
): ClosureTarget {
  switch (rule.targetKind) {
    case "service":
      return { kind: "service", name: services.get(rule.venueServiceId ?? "") ?? null };
    case "booking":
      return {
        kind: "booking",
        bookingTypes: (rule.bookingTypes ?? []).filter((b): b is Channel => CHANNELS.includes(b)),
      };
    case "tables":
      return rule.sectionId
        ? { kind: "section", name: sections?.get(rule.sectionId) ?? null }
        : { kind: "tables", count: rule.tableIds?.length ?? 0 };
    default:
      return { kind: "venue" };
  }
}

function specialDatesNode(
  config: AvailabilityConfig,
  today: string,
  sections: ReadonlyMap<string, string> | null,
  manager: boolean
): SetupNode {
  const upcoming = upcomingRules(config.dateRules, today);
  const services = new Map(config.venueServices.map((s) => [s.id, s.name]));
  const children: SetupNode[] = upcoming.slice(0, SPECIAL_DATES_SHOWN).map((rule) => ({
    id: `special-date:${rule.id}`,
    kind: "specialDate",
    name: null,
    state: {
      kind: "closure",
      what: rule.kind === "closure" ? "closed" : "specialHours",
      startsOn: rule.startsOn,
      endsOn: rule.endsOn ?? null,
      target: targetOf(rule, services, sections),
    },
    actions: [],
    children: [],
  }));
  return {
    id: "special-dates",
    kind: "specialDates",
    name: null,
    state: upcoming.length === 0 ? UNSET : { kind: "count", count: upcoming.length },
    actions: manager
      ? [
          action("openCalendar", link(SETUP_CALENDAR)),
          action("openSpecialDates", link(SETUP_SPECIAL)),
        ]
      : [],
    children,
  };
}

const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

function bookingNode(
  config: AvailabilityConfig,
  settings: VenueSettings | null | undefined,
  today: string,
  manager: boolean
): SetupNode {
  const daysAhead = numberOrNull(settings?.maxAdvanceBooking);
  const noticeHours = numberOrNull(settings?.minAdvanceBooking);
  const largestParty = numberOrNull(settings?.maxPartySize);
  const anySet = daysAhead !== null || noticeHours !== null || largestParty !== null;
  const closures = upcomingRules(config.dateRules, today).filter(
    (r) => r.kind === "closure" && r.targetKind === "booking"
  );
  return {
    id: "booking",
    kind: "booking",
    name: null,
    state: anySet ? { kind: "rules", daysAhead, noticeHours, largestParty } : UNSET,
    actions: manager ? [action("bookingRules", { kind: "dialog", dialog: "bookingRules" })] : [],
    children: CHANNELS.map((channel) => ({
      id: `channel:${channel}`,
      kind: "channel",
      name: channel,
      state: {
        kind: "count",
        count: closures.filter((r) => r.bookingTypes?.includes(channel)).length,
      },
      actions: [],
      children: [],
    })),
  };
}

function openNodes(
  data: OpenData,
  today: string,
  sections: ReadonlyMap<string, string> | null,
  manager: boolean
): SetupNode[] {
  return [
    schedulesNode(data.config, manager),
    specialDatesNode(data.config, today, sections, manager),
    bookingNode(data.config, data.settings, today, manager),
  ];
}

// ── Where guests sit ────────────────────────────────────────────────────────

function tableNode(table: Table): SetupNode {
  return {
    id: `table:${table.id}`,
    kind: "table",
    name: table.name,
    state: { kind: "seats", seats: table.capacity },
    actions: [],
    children: [],
  };
}

function floorPlanNode(
  plan: FloorPlan,
  data: SitData,
  manager: boolean,
  closeSection: boolean
): SetupNode {
  const tables = data.tables.filter((t) => t.isActive && t.floorPlanId === plan.id);
  const sections = data.sections
    .filter((s) => s.floorPlanId === plan.id)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const sectionIds = new Set(sections.map((s) => s.id));
  const sectionNodes: SetupNode[] = sections.map((section) => {
    const own = tables.filter((t) => t.sectionId === section.id);
    return {
      id: `section:${section.id}`,
      kind: "section",
      name: section.name,
      state: { kind: "tables", count: own.length },
      actions:
        manager && closeSection
          ? [
              action(
                "closeSection",
                link(availabilityPath({ closeSection: section.id, from: "setup" })),
                section.name
              ),
            ]
          : [],
      children: own.map(tableNode),
    };
  });
  const loose = tables.filter((t) => !t.sectionId || !sectionIds.has(t.sectionId));
  const planPath = `/floor-plans/${plan.id}`;
  const noSection: SetupNode[] =
    loose.length === 0
      ? []
      : [
          {
            id: `no-section:${plan.id}`,
            kind: "noSection",
            name: null,
            state: { kind: "tables", count: loose.length },
            actions: manager ? [action("moveToSection", link(planPath))] : [],
            children: loose.map(tableNode),
          },
        ];
  return {
    id: `floor-plan:${plan.id}`,
    kind: "floorPlan",
    name: plan.name,
    state: { kind: "floorPlan", sections: sections.length, tables: tables.length },
    actions: manager
      ? [
          action("openFloorPlan", link(planPath), plan.name),
          action("addFloorPlan", link("/floor-plans")),
        ]
      : [],
    children: [...sectionNodes, ...noSection],
  };
}

function sitNodes(data: SitData, manager: boolean, closeSection: boolean): SetupNode[] {
  if (data.floorPlans.length === 0) {
    return [
      {
        id: "floor-plan-empty",
        kind: "floorPlan",
        name: null,
        state: UNSET,
        actions: manager ? [action("addFloorPlan", link("/floor-plans"))] : [],
        children: [],
      },
    ];
  }
  return data.floorPlans.map((plan) => floorPlanNode(plan, data, manager, closeSection));
}

// ── The tree ────────────────────────────────────────────────────────────────

/** The first unset launch step carries the primary button; nothing else does. */
function withPrimary(nodes: readonly SetupNode[], targetId: string | null): SetupNode[] {
  return nodes.map((node) =>
    node.id === targetId
      ? {
          ...node,
          actions: node.actions.map((a, i) => (i === 0 ? { ...a, primary: true } : a)),
        }
      : node
  );
}

export function buildSetupTree(input: SetupTreeInput): SetupTree {
  const { isManager, today, capabilities } = input;
  const sectionNames =
    input.sit.status === "ready"
      ? new Map(input.sit.data.sections.map((s) => [s.id, s.name]))
      : null;
  let open: readonly SetupNode[] =
    input.open.status === "ready" ? openNodes(input.open.data, today, sectionNames, isManager) : [];
  let sit: readonly SetupNode[] =
    input.sit.status === "ready"
      ? sitNodes(input.sit.data, isManager, capabilities.closeSection)
      : [];

  if (isManager && input.readiness === "setup") {
    const first = [...open, ...sit].find((n) => LAUNCH_GATES.has(n.id) && n.state.kind === "unset");
    open = withPrimary(open, first?.id ?? null);
    sit = withPrimary(sit, first?.id ?? null);
  }

  return {
    venueName: input.venueName,
    groups: [
      { id: "open", load: input.open.status === "ready" ? ready : input.open, nodes: open },
      { id: "sit", load: input.sit.status === "ready" ? ready : input.sit, nodes: sit },
    ],
  };
}
