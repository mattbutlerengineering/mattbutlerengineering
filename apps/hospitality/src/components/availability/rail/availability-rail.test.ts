import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { fixtureConfig } from "../resolved-day-fixtures.js";
import { availabilityPath } from "../availability-address.js";
import { buildAvailabilityRail, selectedRailId, type RailNode } from "./availability-rail.js";

const TODAY = "2026-10-30";
const PLANS = [
  { id: "fp-main", name: "Main floor" },
  { id: "fp-patio", name: "Patio" },
];

function rail(overrides: Partial<Parameters<typeof buildAvailabilityRail>[0]> = {}) {
  return buildAvailabilityRail({
    config: fixtureConfig(),
    serviceDate: TODAY,
    floorPlans: PLANS,
    isManager: true,
    ...overrides,
  });
}

const ids = (nodes: readonly RailNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...ids(n.children ?? [])]);

const find = (nodes: readonly RailNode[], id: string): RailNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children ?? [], id);
    if (hit) return hit;
  }
  return undefined;
};

const all = (groups: ReturnType<typeof rail>) => groups.flatMap((g) => g.nodes);

describe("buildAvailabilityRail", () => {
  it("orders the groups time, then space, then the views across both", () => {
    expect(rail().map((g) => g.id)).toEqual(["top", "open", "sit", "views"]);
  });

  it("lists every rule in the order it wins, each at its own address", () => {
    const open = rail().find((g) => g.id === "open")!;
    expect(open.nodes.map((n) => [n.id, n.to])).toEqual([
      ["hours", availabilityPath({ view: "hours" })],
      ["seasonal", availabilityPath({ view: "seasonal" })],
      ["specialDates", availabilityPath({ view: "specialDates" })],
      ["closures", availabilityPath({ view: "closures" })],
      ["bookingRules", availabilityPath({ view: "bookingRules" })],
    ]);
  });

  it("puts each regular-week service under Regular hours, linked to that service", () => {
    const config = fixtureConfig();
    const hours = find(all(rail({ config })), "hours")!;
    const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt)!;
    const serviceIds = config.scheduleServices
      .filter((s) => s.scheduleId === regular.id)
      .map((s) => s.venueServiceId);
    expect(hours.children?.map((c) => c.to)).toEqual(
      serviceIds.map((service) => availabilityPath({ view: "hours", service }))
    );
    expect(hours.children?.every((c) => "text" in c.label && c.label.text.length > 0)).toBe(true);
  });

  it("puts each visible seasonal schedule under Seasonal hours, and leaves out archived ones", () => {
    const base = fixtureConfig();
    const config: AvailabilityConfig = {
      ...base,
      schedules: [
        ...base.schedules,
        {
          ...base.schedules[0]!,
          id: "s-summer",
          name: "Summer",
          isRegular: false,
          kind: "alternate",
        },
        {
          ...base.schedules[0]!,
          id: "s-old",
          name: "Old",
          isRegular: false,
          kind: "alternate",
          archivedAt: "2026-01-01T00:00:00Z",
        },
      ],
    };
    const seasonal = find(all(rail({ config })), "seasonal")!;
    expect(seasonal.children?.map((c) => [c.label, c.to])).toEqual([
      [
        { text: "Summer" },
        // Until the seasonal editor has its own address (#9944 S2a), a schedule opens the list:
        // today's edit address drops the schedule, so every one would share a single link.
        availabilityPath({ view: "seasonal" }),
      ],
    ]);
  });

  it("lists each floor plan under Where guests sit", () => {
    const sit = rail().find((g) => g.id === "sit")!;
    expect(sit.nodes.map((n) => [n.label, n.to])).toEqual([
      [{ text: "Main floor" }, "/floor-plans/fp-main"],
      [{ text: "Patio" }, "/floor-plans/fp-patio"],
    ]);
  });

  it("still shows the rules while the config or floor plans load, with no children yet", () => {
    const groups = rail({ config: null, floorPlans: null });
    expect(find(all(groups), "hours")?.children ?? []).toEqual([]);
    expect(groups.find((g) => g.id === "sit")?.nodes).toEqual([]);
  });

  it("leaves out for a Host the editors a Host is sent away from", () => {
    const hostIds = ids(all(rail({ isManager: false })));
    expect(hostIds).not.toContain("hours");
    expect(hostIds).not.toContain("seasonal");
    // The floor plan editor is Manager-only too (until S3 gives a Host a plan to view).
    expect(hostIds.some((id) => id.startsWith("floorPlan:"))).toBe(false);
    expect(hostIds).toEqual(
      expect.arrayContaining(["overview", "closures", "calendar", "history", "help"])
    );
  });

  it("links the How availability works guide after History in the views group", () => {
    const views = rail().find((g) => g.id === "views");
    expect(views?.nodes.map((n) => n.id)).toEqual(["calendar", "history", "help"]);
    expect(find(all(rail()), "help")).toMatchObject({
      label: { key: "availabilityHub.guide.title" },
      to: "/help/availability",
    });
  });
});

describe("selectedRailId", () => {
  const groups = rail();

  it("selects the overview on the bare address", () => {
    expect(selectedRailId(groups, { pathname: "/availability", search: "" })).toBe("overview");
  });

  it("selects a rule on its own path, ignoring a dialog in the query", () => {
    expect(
      selectedRailId(groups, { pathname: "/availability/closures", search: "?close=tonight" })
    ).toBe("closures");
  });

  it("selects the service a regular-hours address names over Regular hours itself", () => {
    const service = fixtureConfig().scheduleServices[0]!.venueServiceId;
    const [pathname, query] = availabilityPath({ view: "hours", service }).split("?");
    expect(selectedRailId(groups, { pathname: pathname!, search: `?${query}` })).toBe(
      `service:${service}`
    );
    expect(selectedRailId(groups, { pathname: "/availability/hours", search: "" })).toBe("hours");
  });

  it("matches a trailing slash and any case, as the router does", () => {
    expect(selectedRailId(groups, { pathname: "/Availability/History/", search: "" })).toBe(
      "history"
    );
  });

  it("selects nothing on an address the rail does not list", () => {
    expect(selectedRailId(groups, { pathname: "/availability/nope", search: "" })).toBeNull();
  });

  describe("on today's tabbed page", () => {
    const at = (search: string) =>
      selectedRailId(groups, { pathname: "/availability/calendar", search });

    it("selects the node whose job the open layer does", () => {
      expect(at("?tab=calendar")).toBe("calendar");
      expect(at("?tab=special")).toBe("specialDates");
      // The Schedules layer edits the weekly hours, regular and seasonal alike.
      expect(at("?tab=schedules")).toBe("hours");
    });

    it("never selects a seasonal schedule, which has no address of its own yet", () => {
      const base = fixtureConfig();
      const config: AvailabilityConfig = {
        ...base,
        schedules: [
          ...base.schedules,
          { ...base.schedules[0]!, id: "s-a", name: "A", isRegular: false, kind: "alternate" },
        ],
      };
      const withSeasonal = rail({ config });
      expect(selectedRailId(withSeasonal, { pathname: "/availability/seasonal", search: "" })).toBe(
        "seasonal"
      );
    });
  });
});
