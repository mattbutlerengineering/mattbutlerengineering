import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Venue, CreateTableRequest } from "@mbe/types";
import { SHAPE_DEFAULTS } from "../floor-plan/floor-plan-geometry.js";
import { EMPTY_FLOOR_PLAN_DRAFT } from "./floor-plan-draft.js";
import { INITIAL_LAUNCH_PROGRESS } from "./launch-sequence.js";
import type { LaunchProgress } from "./launch-sequence.js";
import { useOnboardingWizard, buildOnboardingPayload, TOTAL_STEPS } from "./useOnboardingWizard.js";

/** Minimal valid CreateTableRequest for addDraftTable — localId ends up === name. */
function makeCreateTableRequest(name: string, x = 100, y = 100): CreateTableRequest {
  return {
    name,
    capacity: 4,
    minCovers: 2,
    shapeMetadata: { shape: "rectangle", x, y, ...SHAPE_DEFAULTS.rectangle },
  };
}

/**
 * Drives the wizard from step 1 to step 5 with valid data at every step
 * (settings is pre-filled with RECOMMENDED_SETTINGS, so step 4 needs no
 * explicit data). Shared by every step-5 test below.
 */
function advanceToStep5(result: { current: ReturnType<typeof useOnboardingWizard> }): void {
  act(() =>
    result.current.actions.setStepData("basicInfo", {
      name: "My Venue",
      slug: "my-venue",
      venueGroupId: "",
    })
  );
  act(() => result.current.actions.next());
  act(() =>
    result.current.actions.setStepData("locationTime", {
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
    })
  );
  act(() => result.current.actions.next());
  act(() =>
    result.current.actions.setStepData("operatingHours", {
      monday: { open: "09:00", close: "17:00" },
    })
  );
  act(() => result.current.actions.next());
  act(() => result.current.actions.next());
}

const mockVenue: Venue = {
  id: "venue-1",
  name: "My Venue",
  slug: "my-venue",
  venueGroupId: null,
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("useOnboardingWizard", () => {
  describe("initial state", () => {
    it("starts on step 1 with highestStepReached 1", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      expect(result.current.step).toBe(1);
      expect(result.current.highestStepReached).toBe(1);
      expect(result.current.slugStatus).toBe("idle");
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.submitError).toBeNull();
    });

    it("seeds data.floorPlan and launch with the additive slices' initial values", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      expect(result.current.data.floorPlan).toEqual(EMPTY_FLOOR_PLAN_DRAFT);
      expect(result.current.launch).toEqual(INITIAL_LAUNCH_PROGRESS);
      expect(result.current.errors.floorPlan).toBeNull();
    });
  });

  describe("setStepData", () => {
    it("updates basicInfo data", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue",
          venueGroupId: "",
        })
      );
      expect(result.current.data.basicInfo.name).toBe("My Venue");
    });

    it("resets slugStatus to idle when the slug value changes", async () => {
      const { result } = renderHook(() => useOnboardingWizard());
      await act(async () => {
        await result.current.actions.checkSlugAvailability(Promise.resolve(mockVenue));
      });
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue-2",
          venueGroupId: "",
        })
      );
      expect(result.current.slugStatus).toBe("idle");
    });
  });

  describe("forward-nav gating (next)", () => {
    it("does not advance and populates errors when step 1 data is invalid", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() => result.current.actions.next());
      expect(result.current.step).toBe(1);
      expect(result.current.errors.basicInfo.name).toBe("Name must be at least 2 characters");
      expect(result.current.errors.basicInfo.slug).toBe("Slug is required");
    });

    it("advances to step 2 and raises highestStepReached when step 1 is valid", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue",
          venueGroupId: "",
        })
      );
      act(() => result.current.actions.next());
      expect(result.current.step).toBe(2);
      expect(result.current.highestStepReached).toBe(2);
    });

    it("blocks advancing from step 3 when no operating-hours day is enabled", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue",
          venueGroupId: "",
        })
      );
      act(() => result.current.actions.next());
      act(() =>
        result.current.actions.setStepData("locationTime", {
          ianaTimezone: "America/New_York",
          currencyCode: "USD",
        })
      );
      act(() => result.current.actions.next());
      act(() => result.current.actions.next());
      expect(result.current.step).toBe(3);
      expect(result.current.errors.operatingHours?.global).toBe("At least one day must be open");
    });
  });

  describe("back", () => {
    it("moves back one step, floored at 1", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue",
          venueGroupId: "",
        })
      );
      act(() => result.current.actions.next());
      expect(result.current.step).toBe(2);
      act(() => result.current.actions.back());
      expect(result.current.step).toBe(1);
      act(() => result.current.actions.back());
      expect(result.current.step).toBe(1);
    });
  });

  describe("goToStep", () => {
    it("cannot skip to a step beyond highestStepReached", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() => result.current.actions.goToStep(3));
      expect(result.current.step).toBe(1);
    });

    it("can jump back to any previously-reached step", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue",
          venueGroupId: "",
        })
      );
      act(() => result.current.actions.next());
      act(() => result.current.actions.goToStep(1));
      expect(result.current.step).toBe(1);
      act(() => result.current.actions.goToStep(2));
      expect(result.current.step).toBe(2);
    });
  });

  describe("checkSlugAvailability", () => {
    it("sets slugStatus to checking while pending", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      const neverResolve = new Promise<Venue>(() => {});
      void act(() => {
        result.current.actions.checkSlugAvailability(neverResolve);
      });
      expect(result.current.slugStatus).toBe("checking");
    });

    it("slug-taken: resolved check marks slugStatus taken and sets a slug error", async () => {
      const { result } = renderHook(() => useOnboardingWizard());
      await act(async () => {
        await result.current.actions.checkSlugAvailability(Promise.resolve(mockVenue));
      });
      expect(result.current.slugStatus).toBe("taken");
      expect(result.current.errors.basicInfo.slug).toBe("A venue with this slug already exists");
    });

    it("rejected check (404) marks slugStatus available and clears the slug error", async () => {
      const { result } = renderHook(() => useOnboardingWizard());
      await act(async () => {
        await result.current.actions.checkSlugAvailability(Promise.reject(new Error("not found")));
      });
      expect(result.current.slugStatus).toBe("available");
      expect(result.current.errors.basicInfo.slug).toBeUndefined();
    });
  });

  describe("submit", () => {
    it("sets isSubmitting true while pending", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      const neverResolve = new Promise<Venue>(() => {});
      void act(() => {
        result.current.actions.submit(neverResolve);
      });
      expect(result.current.isSubmitting).toBe(true);
    });

    it("resolves: clears isSubmitting and submitError, returns the venue", async () => {
      const { result } = renderHook(() => useOnboardingWizard());
      let resolved: Venue | undefined;
      await act(async () => {
        resolved = await result.current.actions.submit(Promise.resolve(mockVenue));
      });
      expect(resolved).toEqual(mockVenue);
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.submitError).toBeNull();
    });

    it("rejects: sets submitError, clears isSubmitting, and rethrows", async () => {
      const { result } = renderHook(() => useOnboardingWizard());
      const onCatch = vi.fn();
      await act(async () => {
        await result.current.actions
          .submit(Promise.reject(new Error("Slug already taken")))
          .catch(onCatch);
      });
      expect(onCatch).toHaveBeenCalledWith(new Error("Slug already taken"));
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.submitError).toBe("Slug already taken");
    });
  });

  describe("setTemplate", () => {
    it("restaurant yields 14 tables and pristine true; blank afterward yields zero tables and pristine true again", () => {
      const { result } = renderHook(() => useOnboardingWizard());

      act(() => result.current.actions.setTemplate("restaurant"));
      expect(result.current.data.floorPlan.tables).toHaveLength(14);
      expect(result.current.data.floorPlan.planName).toBe("Main Dining Room");
      expect(result.current.data.floorPlan.pristine).toBe(true);

      act(() => result.current.actions.setTemplate("blank"));
      expect(result.current.data.floorPlan.tables).toHaveLength(0);
      expect(result.current.data.floorPlan.pristine).toBe(true);
    });

    it("clears errors.floorPlan", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      advanceToStep5(result);
      act(() => result.current.actions.next());
      expect(result.current.errors.floorPlan).not.toBeNull();

      act(() => result.current.actions.setTemplate("restaurant"));
      expect(result.current.errors.floorPlan).toBeNull();
    });
  });

  describe("draft table mutations", () => {
    it("addDraftTable appends one table keyed by request.name and flips pristine to false, without mutating the previous state", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() => result.current.actions.setTemplate("blank"));
      const prevFloorPlan = result.current.data.floorPlan;

      act(() => result.current.actions.addDraftTable(makeCreateTableRequest("T1")));

      expect(result.current.data.floorPlan.tables).toHaveLength(1);
      expect(result.current.data.floorPlan.tables[0]?.localId).toBe("T1");
      expect(result.current.data.floorPlan.pristine).toBe(false);
      expect(prevFloorPlan.tables).toHaveLength(0);
      expect(prevFloorPlan.pristine).toBe(true);
    });

    it("moveDraftTable changes only the target table's x/y, without mutating the previous state", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() => result.current.actions.setTemplate("blank"));
      act(() => result.current.actions.addDraftTable(makeCreateTableRequest("T1", 100, 100)));
      act(() => result.current.actions.addDraftTable(makeCreateTableRequest("T2", 200, 200)));
      const prevTables = result.current.data.floorPlan.tables;

      act(() => result.current.actions.moveDraftTable("T1", 300, 340));

      const tables = result.current.data.floorPlan.tables;
      expect(tables.find((t) => t.localId === "T1")).toMatchObject({ x: 300, y: 340 });
      expect(tables.find((t) => t.localId === "T2")).toMatchObject({ x: 200, y: 200 });
      expect(result.current.data.floorPlan.pristine).toBe(false);
      expect(prevTables.find((t) => t.localId === "T1")).toMatchObject({ x: 100, y: 100 });
    });

    it("removeDraftTable drops exactly one table, without mutating the previous state", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() => result.current.actions.setTemplate("blank"));
      act(() => result.current.actions.addDraftTable(makeCreateTableRequest("T1")));
      act(() => result.current.actions.addDraftTable(makeCreateTableRequest("T2", 200, 200)));
      const prevTables = result.current.data.floorPlan.tables;

      act(() => result.current.actions.removeDraftTable("T1"));

      expect(result.current.data.floorPlan.tables.map((t) => t.localId)).toEqual(["T2"]);
      expect(result.current.data.floorPlan.pristine).toBe(false);
      expect(prevTables).toHaveLength(2);
    });
  });

  describe("floor plan draft persists across navigation", () => {
    it("leaves data.floorPlan deep-equal across next()/back() and goToStep() round trips at step 5", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      advanceToStep5(result);
      act(() => result.current.actions.setTemplate("restaurant"));
      act(() => result.current.actions.addDraftTable(makeCreateTableRequest("Extra", 300, 300)));
      act(() => result.current.actions.moveDraftTable("Extra", 340, 340));
      const beforeNav = result.current.data.floorPlan;

      act(() => result.current.actions.next());
      act(() => result.current.actions.back());
      expect(result.current.data.floorPlan).toEqual(beforeNav);

      act(() => result.current.actions.goToStep(2));
      act(() => result.current.actions.goToStep(5));
      expect(result.current.data.floorPlan).toEqual(beforeNav);
    });
  });

  describe("post-venue navigation locks", () => {
    it("with launch.venueId set: GO_TO_STEP below 5 is refused and BACK floors at step 5", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      advanceToStep5(result);
      act(() =>
        result.current.actions.setLaunchProgress({
          ...INITIAL_LAUNCH_PROGRESS,
          venueId: "venue-1",
        })
      );

      act(() => result.current.actions.goToStep(2));
      expect(result.current.step).toBe(5);

      act(() => result.current.actions.back());
      expect(result.current.step).toBe(5);
    });

    it("with launch.venueId null: GO_TO_STEP and BACK behave exactly as today", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      advanceToStep5(result);

      act(() => result.current.actions.goToStep(2));
      expect(result.current.step).toBe(2);

      act(() => result.current.actions.goToStep(5));
      act(() => result.current.actions.back());
      expect(result.current.step).toBe(4);
    });
  });

  describe("step 5 validation (floor plan)", () => {
    it("next() with templateId null sets errors.floorPlan to the exact sentence and does not advance", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      advanceToStep5(result);

      act(() => result.current.actions.next());

      expect(result.current.step).toBe(5);
      expect(result.current.errors.floorPlan).toBe(
        "Choose a layout to continue — pick Blank to start with an empty floor."
      );
    });

    it("next() with a template chosen is valid and clears the error", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      advanceToStep5(result);
      act(() => result.current.actions.next());
      expect(result.current.errors.floorPlan).not.toBeNull();

      act(() => result.current.actions.setTemplate("blank"));
      act(() => result.current.actions.next());

      expect(result.current.errors.floorPlan).toBeNull();
    });
  });

  describe("setLaunchProgress", () => {
    it("replaces state.launch wholesale and is exposed as result.current.launch", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      const next: LaunchProgress = {
        ...INITIAL_LAUNCH_PROGRESS,
        venueId: "venue-1",
        inFlightStage: "floorPlan",
      };

      act(() => result.current.actions.setLaunchProgress(next));

      expect(result.current.launch).toEqual(next);
    });
  });
});

describe("buildOnboardingPayload", () => {
  it("builds the minimal payload from required fields", () => {
    const payload = buildOnboardingPayload({
      basicInfo: { name: "My Venue", slug: "my-venue", venueGroupId: "" },
      locationTime: { ianaTimezone: "America/New_York", currencyCode: "USD" },
      operatingHours: {},
      settings: { defaultReservationDuration: "", maxPartySize: "", advanceBookingDays: "" },
    });
    expect(payload).toEqual({
      name: "My Venue",
      slug: "my-venue",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
    });
  });

  it("includes operatingHours and numeric settings when provided", () => {
    const payload = buildOnboardingPayload({
      basicInfo: { name: "My Venue", slug: "my-venue", venueGroupId: "" },
      locationTime: { ianaTimezone: "Europe/London", currencyCode: "GBP" },
      operatingHours: { monday: { open: "09:00", close: "22:00" } },
      settings: { defaultReservationDuration: "60", maxPartySize: "8", advanceBookingDays: "" },
    });
    expect(payload.operatingHours).toEqual({ monday: { open: "09:00", close: "22:00" } });
    expect(payload.settings).toEqual({ defaultReservationDuration: 60, maxPartySize: 8 });
  });

  it("caps advancement at TOTAL_STEPS", () => {
    expect(TOTAL_STEPS).toBe(6);
  });

  // Regression: #3082 refactor returned `actions` as a fresh object literal every
  // render. Because VenueOnboardingPage lists `actions` in the debounced slug-check
  // effect deps, that unstable identity re-ran the effect every render → a
  // self-sustaining ~500ms poll of api.venues.getBySlug with no user input.
  describe("actions identity stability", () => {
    it("keeps the actions object referentially stable across a plain re-render", () => {
      const { result, rerender } = renderHook(() => useOnboardingWizard());
      const first = result.current.actions;
      rerender();
      expect(result.current.actions).toBe(first);
    });

    it("keeps the actions object stable after a state-changing re-render", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      const first = result.current.actions;
      act(() =>
        result.current.actions.setStepData("basicInfo", {
          name: "My Venue",
          slug: "my-venue",
          venueGroupId: "",
        })
      );
      expect(result.current.actions).toBe(first);
    });
  });

  // Regression: on-blur field validation. Step inputs wire onBlur -> onValidate;
  // validateStep must recompute the current step's errors without advancing.
  describe("validateStep", () => {
    it("populates the current step's errors without changing step", () => {
      const { result } = renderHook(() => useOnboardingWizard());
      act(() => result.current.actions.validateStep());
      expect(result.current.step).toBe(1);
      expect(result.current.errors.basicInfo.name).toBeDefined();
      expect(result.current.errors.basicInfo.slug).toBeDefined();
    });
  });
});
