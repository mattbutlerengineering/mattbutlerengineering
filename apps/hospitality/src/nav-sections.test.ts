import { describe, it, expect } from "vitest";
import { buildNavSections } from "./nav-sections.js";
import type { VenueReadiness } from "./hooks/useVenueReadiness.js";

/* ── Fixtures ───────────────────────────────────────────────── */

const NO_VENUE_READINESS: VenueReadiness = {
  status: "no-venue",
  completedSteps: [],
  nextStep: null,
  progress: 0,
};

const SETUP_READINESS: VenueReadiness = {
  status: "setup",
  completedSteps: ["onboarding"],
  nextStep: "operating-hours",
  progress: 33,
};

const OPERATIONAL_READINESS: VenueReadiness = {
  status: "operational",
  completedSteps: ["onboarding", "operating-hours", "floor-plan"],
  nextStep: null,
  progress: 100,
};

/* ── Tests ──────────────────────────────────────────────────── */

describe("buildNavSections", () => {
  describe("setup readiness", () => {
    it("returns a 'Get Started' section holding one Venue Setup item with the progress count", () => {
      const sections = buildNavSections(SETUP_READINESS, false);
      const getStarted = sections.find((s) => s.label === "Get Started");

      expect(getStarted).toBeDefined();
      expect(getStarted!.items).toEqual([
        {
          id: "setup",
          label: "Venue Setup",
          action: { type: "route", path: "/setup" },
          badge: "1 of 3",
        },
      ]);
    });

    it("counts completed steps, and never locks an item", () => {
      const none = buildNavSections(NO_VENUE_READINESS, false).flatMap((s) => s.items);
      expect(none.find((i) => i.id === "setup")?.badge).toBe("0 of 3");

      const two = buildNavSections(
        { ...SETUP_READINESS, completedSteps: ["onboarding", "operating-hours"] },
        false
      ).flatMap((s) => s.items);
      expect(two.find((i) => i.id === "setup")?.badge).toBe("2 of 3");

      for (const item of [...none, ...two]) {
        expect(item).not.toHaveProperty("disabled");
        expect(item).not.toHaveProperty("stepStatus");
      }
    });

    it("drops the three step items and Floor Plans", () => {
      const ids = buildNavSections(SETUP_READINESS, false).flatMap((s) => s.items.map((i) => i.id));
      expect(ids).not.toContain("setup-onboarding");
      expect(ids).not.toContain("setup-operating-hours");
      expect(ids).not.toContain("setup-floor-plan");
      expect(ids).not.toContain("floor-plans");
    });

    it("includes Account section", () => {
      const sections = buildNavSections(SETUP_READINESS, false);
      const account = sections.find((s) => s.label === "Account");
      expect(account).toBeDefined();
    });
  });

  describe("same destination, same label in both readiness states", () => {
    it("labels /setup 'Venue Setup' before and after launch", () => {
      const find = (r: VenueReadiness) =>
        buildNavSections(r, false)
          .flatMap((s) => s.items)
          .filter((i) => i.action.type === "route" && i.action.path === "/setup");
      const before = find(SETUP_READINESS);
      const after = find(OPERATIONAL_READINESS);
      expect(before.map((i) => i.label)).toEqual(["Venue Setup"]);
      expect(after.map((i) => i.label)).toEqual(["Venue Setup"]);
      expect(after[0]).not.toHaveProperty("badge");
    });
  });

  describe("operational readiness", () => {
    it("returns primary items including briefing first", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS, false);
      // First section has no label (primary nav)
      const primary = sections[0]!;
      expect(primary.label).toBeUndefined();
      expect(primary.items[0]!.id).toBe("briefing");
      expect(primary.items.some((i) => i.id === "timeline")).toBe(true);
    });

    it("includes a Manage section", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS, false);
      const manage = sections.find((s) => s.label === "Manage");
      expect(manage).toBeDefined();
      expect(manage!.items.length).toBeGreaterThan(0);
    });

    it("lists Venue Setup then Availability in Manage, with no Floor Plans item", () => {
      const manage = buildNavSections(OPERATIONAL_READINESS, false).find(
        (s) => s.label === "Manage"
      )!;
      expect(manage.items.map((i) => i.id)).toEqual([
        "setup",
        "availability",
        "menus",
        "booking-widget",
      ]);
      expect(manage.items.map((i) => i.label)).toEqual([
        "Venue Setup",
        "Availability",
        "Menus",
        "Booking Widget",
      ]);
    });

    it("includes an Account section", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS, false);
      const account = sections.find((s) => s.label === "Account");
      expect(account).toBeDefined();
    });

    it("does not include a 'Get Started' section", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS, false);
      const getStarted = sections.find((s) => s.label === "Get Started");
      expect(getStarted).toBeUndefined();
    });
  });

  describe("no-venue readiness", () => {
    it("returns a 'Get Started' section", () => {
      const sections = buildNavSections(NO_VENUE_READINESS, false);
      const getStarted = sections.find((s) => s.label === "Get Started");
      expect(getStarted).toBeDefined();
    });

    it("does not include a Manage section", () => {
      const sections = buildNavSections(NO_VENUE_READINESS, false);
      const manage = sections.find((s) => s.label === "Manage");
      expect(manage).toBeUndefined();
    });
  });

  describe("admin gating (#3069)", () => {
    it("includes the Admin section only for admins in operational mode", () => {
      const asAdmin = buildNavSections(OPERATIONAL_READINESS, true);
      expect(asAdmin.find((s) => s.label === "Admin")).toBeDefined();

      const asNonAdmin = buildNavSections(OPERATIONAL_READINESS, false);
      expect(asNonAdmin.find((s) => s.label === "Admin")).toBeUndefined();
    });

    it("includes the Admin section only for admins in setup mode", () => {
      const asAdmin = buildNavSections(SETUP_READINESS, true);
      expect(asAdmin.find((s) => s.label === "Admin")).toBeDefined();

      const asNonAdmin = buildNavSections(SETUP_READINESS, false);
      expect(asNonAdmin.find((s) => s.label === "Admin")).toBeUndefined();
    });
  });
});
