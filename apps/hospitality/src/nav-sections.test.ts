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
    it("returns a 'Get Started' section with correct step statuses", () => {
      const sections = buildNavSections(SETUP_READINESS);
      const getStarted = sections.find((s) => s.label === "Get Started");

      expect(getStarted).toBeDefined();
      const items = getStarted!.items;

      // onboarding is completed
      const onboarding = items.find((i) => i.id === "setup-onboarding");
      expect(onboarding).toBeDefined();
      expect(onboarding!.stepStatus).toBe("completed");
      expect(onboarding!.disabled).toBeFalsy();

      // operating-hours is current (next step)
      const hours = items.find((i) => i.id === "setup-operating-hours");
      expect(hours).toBeDefined();
      expect(hours!.stepStatus).toBe("current");
      expect(hours!.disabled).toBeFalsy();

      // floor-plan is locked
      const floorPlan = items.find((i) => i.id === "setup-floor-plan");
      expect(floorPlan).toBeDefined();
      expect(floorPlan!.stepStatus).toBe("locked");
      expect(floorPlan!.disabled).toBe(true);
    });

    it("includes Account section", () => {
      const sections = buildNavSections(SETUP_READINESS);
      const account = sections.find((s) => s.label === "Account");
      expect(account).toBeDefined();
    });
  });

  describe("operational readiness", () => {
    it("returns primary items including briefing first", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS);
      // First section has no label (primary nav)
      const primary = sections[0];
      expect(primary.label).toBeUndefined();
      expect(primary.items[0].id).toBe("briefing");
      expect(primary.items.some((i) => i.id === "timeline")).toBe(true);
    });

    it("includes a Manage section", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS);
      const manage = sections.find((s) => s.label === "Manage");
      expect(manage).toBeDefined();
      expect(manage!.items.length).toBeGreaterThan(0);
    });

    it("includes an Account section", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS);
      const account = sections.find((s) => s.label === "Account");
      expect(account).toBeDefined();
    });

    it("does not include a 'Get Started' section", () => {
      const sections = buildNavSections(OPERATIONAL_READINESS);
      const getStarted = sections.find((s) => s.label === "Get Started");
      expect(getStarted).toBeUndefined();
    });
  });

  describe("no-venue readiness", () => {
    it("returns a 'Get Started' section", () => {
      const sections = buildNavSections(NO_VENUE_READINESS);
      const getStarted = sections.find((s) => s.label === "Get Started");
      expect(getStarted).toBeDefined();
    });

    it("all steps are either current or locked (none completed)", () => {
      const sections = buildNavSections(NO_VENUE_READINESS);
      const getStarted = sections.find((s) => s.label === "Get Started")!;

      for (const item of getStarted.items) {
        expect(["current", "locked"]).toContain(item.stepStatus);
        expect(item.stepStatus).not.toBe("completed");
      }
    });

    it("does not include a Manage section", () => {
      const sections = buildNavSections(NO_VENUE_READINESS);
      const manage = sections.find((s) => s.label === "Manage");
      expect(manage).toBeUndefined();
    });
  });
});
