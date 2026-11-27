import type { AvailabilityConfig } from "@mbe/types";
import { availabilityPath, isTodaysPage, parseAvailabilityEntry } from "../availability-address.js";
import { visibleSchedules } from "../superseded-schedules.js";

/**
 * The Availability rail (#9944): every Availability screen as one tree, time first (the rules, in
 * the order they win), then space (floor plans), then the views across both. Each node is an
 * address, so the rail is the map a Manager reads while editing, and the way to every screen.
 * Pure, so the layout and its tests read the same tree.
 */

/** The catalog keys the rail's fixed nodes and headings use. */
export type RailKey =
  | "availabilityHub.rail.overview"
  | "availabilityHub.rail.groups.open"
  | "availabilityHub.rail.groups.sit"
  | "availabilityHub.rail.groups.views"
  | "availabilityHub.routes.regularHours"
  | "availabilityHub.routes.seasonalHours"
  | "availabilityHub.routes.specialDates"
  | "availabilityHub.hub.closures.title"
  | "availabilityHub.routes.bookingRules"
  | "availabilityHub.routes.calendar"
  | "availabilityHub.routes.history";

/** A fixed node is named by a catalog key; a record (a service, a schedule, a plan) by its name. */
export type RailLabel = { readonly key: RailKey } | { readonly text: string };

export interface RailNode {
  readonly id: string;
  readonly label: RailLabel;
  readonly to: string;
  readonly children?: readonly RailNode[];
}

export interface RailGroup {
  readonly id: "top" | "open" | "sit" | "views";
  /** None for the top group, which holds only the overview. */
  readonly heading?: RailKey;
  readonly nodes: readonly RailNode[];
}

export interface RailInput {
  /** `null` while the config loads: the rules still show, with no records under them yet. */
  readonly config: AvailabilityConfig | null;
  /** The service date superseded regular weeks are judged on (`currentServiceDate`). */
  readonly serviceDate: string;
  readonly floorPlans: readonly { readonly id: string; readonly name: string }[] | null;
  /** A Host is sent away from regular and seasonal hours, so the rail leaves them out. */
  readonly isManager: boolean;
}

/** Until floor plans move under Availability (#9944 S3), a plan opens where it is edited today. */
const floorPlanPath = (id: string): string => `/floor-plans/${encodeURIComponent(id)}`;

function regularServices(config: AvailabilityConfig, serviceDate: string): RailNode[] {
  const regular = visibleSchedules(config, serviceDate).find((s) => s.isRegular);
  if (!regular) return [];
  const names = new Map(
    config.venueServices.filter((v) => !v.archivedAt).map((v) => [v.id, v] as const)
  );
  return config.scheduleServices
    .filter((s) => s.scheduleId === regular.id && names.has(s.venueServiceId))
    .map((s) => names.get(s.venueServiceId)!)
    .sort((a, b) => a.position - b.position)
    .map((v) => ({
      id: `service:${v.id}`,
      label: { text: v.name },
      to: availabilityPath({ view: "hours", service: v.id }),
    }));
}

function seasonalSchedules(config: AvailabilityConfig, serviceDate: string): RailNode[] {
  return visibleSchedules(config, serviceDate)
    .filter((s) => !s.isRegular)
    .map((s) => ({
      id: `schedule:${s.id}`,
      label: { text: s.name },
      // Until the seasonal editor has its own address (#9944 S2a) a schedule opens the list: the
      // edit address today drops the schedule, so every schedule would share one link.
      to: availabilityPath({ view: "seasonal" }),
    }));
}

export function buildAvailabilityRail(input: RailInput): RailGroup[] {
  const { config, serviceDate, floorPlans, isManager } = input;
  const managerOnly: RailNode[] = isManager
    ? [
        {
          id: "hours",
          label: { key: "availabilityHub.routes.regularHours" },
          to: availabilityPath({ view: "hours" }),
          children: config ? regularServices(config, serviceDate) : [],
        },
        {
          id: "seasonal",
          label: { key: "availabilityHub.routes.seasonalHours" },
          to: availabilityPath({ view: "seasonal" }),
          children: config ? seasonalSchedules(config, serviceDate) : [],
        },
      ]
    : [];
  return [
    {
      id: "top",
      nodes: [
        {
          id: "overview",
          label: { key: "availabilityHub.rail.overview" },
          to: availabilityPath({ view: "hub" }),
        },
      ],
    },
    {
      id: "open",
      heading: "availabilityHub.rail.groups.open",
      nodes: [
        ...managerOnly,
        {
          id: "specialDates",
          label: { key: "availabilityHub.routes.specialDates" },
          to: availabilityPath({ view: "specialDates" }),
        },
        {
          id: "closures",
          label: { key: "availabilityHub.hub.closures.title" },
          to: availabilityPath({ view: "closures" }),
        },
        {
          id: "bookingRules",
          label: { key: "availabilityHub.routes.bookingRules" },
          to: availabilityPath({ view: "bookingRules" }),
        },
      ],
    },
    {
      id: "sit",
      heading: "availabilityHub.rail.groups.sit",
      // The floor plan editor is Manager-only; a Host gets a plan to view in #9944 S3.
      nodes: (isManager ? (floorPlans ?? []) : []).map((p) => ({
        id: `floorPlan:${p.id}`,
        label: { text: p.name },
        to: floorPlanPath(p.id),
      })),
    },
    {
      id: "views",
      heading: "availabilityHub.rail.groups.views",
      nodes: [
        {
          id: "calendar",
          label: { key: "availabilityHub.routes.calendar" },
          to: availabilityPath({ view: "calendar" }),
        },
        {
          id: "history",
          label: { key: "availabilityHub.routes.history" },
          to: availabilityPath({ view: "history" }),
        },
      ],
    },
  ];
}

const normalPath = (pathname: string): string => pathname.replace(/\/+$/, "").toLowerCase() || "/";

/**
 * How well a node's address matches the current one: `-1` for no match, else the number of the
 * node's own query params the current query carries. Params the node does not name (a dialog,
 * `?from=`) never stop a match.
 */
function matchScore(to: string, pathname: string, params: URLSearchParams): number {
  const [path = "", query = ""] = to.split("?");
  if (normalPath(path) !== pathname) return -1;
  const own = [...new URLSearchParams(query)];
  return own.every(([k, v]) => params.get(k) === v) ? own.length : -1;
}

const hasNode = (groups: readonly RailGroup[], id: string): boolean =>
  groups.some((g) => g.nodes.some((n) => n.id === id));

/**
 * The node the current address opens: the one whose path matches and whose own query params the
 * address carries most of, so `hours?service=x` selects that service over Regular hours. First in
 * rail order on a tie; `null` when the rail lists no node there.
 */
export function selectedRailId(
  groups: readonly RailGroup[],
  location: { readonly pathname: string; readonly search: string }
): string | null {
  const pathname = normalPath(location.pathname);
  const params = new URLSearchParams(location.search);
  let best: { id: string; score: number } | null = null;
  const visit = (nodes: readonly RailNode[]) => {
    for (const node of nodes) {
      const score = matchScore(node.to, pathname, params);
      if (score >= 0 && (best === null || score > best.score)) best = { id: node.id, score };
      visit(node.children ?? []);
    }
  };
  groups.forEach((g) => visit(g.nodes));
  const found = (best as { id: string } | null)?.id ?? null;
  if (found) return found;
  // Today's Schedules layer edits the weekly hours, regular and seasonal alike (until #9944 S6).
  const onSchedules =
    isTodaysPage(location.pathname) && parseAvailabilityEntry(params).tab === "schedules";
  return onSchedules && hasNode(groups, "hours") ? "hours" : null;
}
