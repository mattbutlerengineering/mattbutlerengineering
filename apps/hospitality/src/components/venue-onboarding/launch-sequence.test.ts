import { describe, it, expect, vi } from "vitest";
import type { CreateVenueRequest, Venue, FloorPlan, Table } from "@mbe/types";
import type { DraftTable, FloorPlanDraft } from "./floor-plan-draft.js";
import {
  DEFAULT_LAYOUT,
  INITIAL_LAUNCH_PROGRESS,
  stagesFor,
  nextStage,
  stageStateOf,
  tablesDoneCount,
  isAlreadyCreatedError,
  runLaunchSequence,
} from "./launch-sequence.js";
import type { LaunchApi, LaunchProgress, LaunchStageId } from "./launch-sequence.js";

function makeDraftTable(overrides: Partial<DraftTable> = {}): DraftTable {
  return {
    localId: overrides.name ?? "T1",
    name: "T1",
    capacity: 4,
    minCovers: 1,
    shape: "rectangle",
    x: 100,
    y: 100,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<FloorPlanDraft> = {}): FloorPlanDraft {
  return {
    templateId: "template-1",
    planName: "Main Floor",
    tables: [
      makeDraftTable({ localId: "T1", name: "T1" }),
      makeDraftTable({ localId: "T2", name: "T2" }),
      makeDraftTable({ localId: "T3", name: "T3" }),
    ],
    pristine: false,
    ...overrides,
  };
}

const VENUE_PAYLOAD: CreateVenueRequest = {
  name: "The Grand",
  slug: "the-grand",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
};

function makeVenue(id = "venue-1"): Venue {
  return {
    id,
    venueGroupId: null,
    name: VENUE_PAYLOAD.name,
    slug: VENUE_PAYLOAD.slug,
    ianaTimezone: VENUE_PAYLOAD.ianaTimezone,
    currencyCode: "USD",
    operatingHours: null,
    settings: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFloorPlan(id = "floor-plan-1", venueId = "venue-1"): FloorPlan {
  return {
    id,
    venueId,
    name: "Main Floor",
    isActive: false,
    layoutJson: DEFAULT_LAYOUT,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeTable(name: string): Table {
  return {
    id: `table-${name}`,
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
    floorPlanId: "floor-plan-1",
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Tracks cross-mock call order via a single shared log. */
function makeFakeApi(callLog: string[] = []): LaunchApi & { callLog: string[] } {
  return {
    callLog,
    venues: {
      create: vi.fn(async (_data: CreateVenueRequest) => {
        callLog.push("venues.create");
        return makeVenue();
      }),
    },
    floorPlans: {
      create: vi.fn(async () => {
        callLog.push("floorPlans.create");
        return makeFloorPlan();
      }),
      setActive: vi.fn(async () => {
        callLog.push("floorPlans.setActive");
        return { ...makeFloorPlan(), isActive: true };
      }),
    },
    tables: {
      create: vi.fn(async (data: { name: string }) => {
        callLog.push(`tables.create:${data.name}`);
        return makeTable(data.name);
      }),
    },
  };
}

describe("launch-sequence", () => {
  describe("DEFAULT_LAYOUT", () => {
    it("matches the geometry constants NewFloorPlanDialog uses", () => {
      expect(DEFAULT_LAYOUT).toEqual({
        width: 800,
        height: 600,
        gridSize: 20,
        showGrid: true,
      });
    });
  });

  describe("INITIAL_LAUNCH_PROGRESS", () => {
    it("is all-null / empty / false", () => {
      expect(INITIAL_LAUNCH_PROGRESS).toEqual({
        venueId: null,
        floorPlanId: null,
        createdTableNames: [],
        activated: false,
        inFlightStage: null,
        failedStage: null,
        errorMessage: null,
      });
    });
  });

  describe("stagesFor", () => {
    it("returns all four stages for a non-empty draft", () => {
      expect(stagesFor(makeDraft())).toEqual(["venue", "floorPlan", "tables", "activate"]);
    });

    it("omits tables at N = 0", () => {
      expect(stagesFor(makeDraft({ tables: [] }))).toEqual(["venue", "floorPlan", "activate"]);
    });
  });

  describe("nextStage", () => {
    it("returns venue first for a fresh progress", () => {
      expect(nextStage(INITIAL_LAUNCH_PROGRESS, makeDraft())).toBe("venue");
    });

    it("returns null once every stage is complete", () => {
      const done: LaunchProgress = {
        venueId: "v1",
        floorPlanId: "fp1",
        createdTableNames: ["T1", "T2", "T3"],
        activated: true,
        inFlightStage: null,
        failedStage: null,
        errorMessage: null,
      };
      expect(nextStage(done, makeDraft())).toBeNull();
    });

    it("skips the tables stage at N = 0", () => {
      const afterFloorPlan: LaunchProgress = {
        ...INITIAL_LAUNCH_PROGRESS,
        venueId: "v1",
        floorPlanId: "fp1",
      };
      expect(nextStage(afterFloorPlan, makeDraft({ tables: [] }))).toBe("activate");
    });

    it("never returns venue once venueId is set, across a matrix of the other fields", () => {
      const draft = makeDraft();
      const bools = [false, true];
      const stageOptions: (LaunchStageId | null)[] = [null, "floorPlan", "tables", "activate"];
      for (const activated of bools) {
        for (const inFlightStage of stageOptions) {
          for (const failedStage of stageOptions) {
            const progress: LaunchProgress = {
              venueId: "v1",
              floorPlanId: null,
              createdTableNames: [],
              activated,
              inFlightStage,
              failedStage,
              errorMessage: null,
            };
            expect(nextStage(progress, draft)).not.toBe("venue");
          }
        }
      }
    });
  });

  describe("stageStateOf", () => {
    it("is in-flight only for progress.inFlightStage", () => {
      const progress: LaunchProgress = { ...INITIAL_LAUNCH_PROGRESS, inFlightStage: "floorPlan" };
      expect(stageStateOf(progress, "floorPlan")).toBe("in-flight");
      expect(stageStateOf(progress, "venue")).not.toBe("in-flight");
    });

    it("is failed only for progress.failedStage", () => {
      const progress: LaunchProgress = { ...INITIAL_LAUNCH_PROGRESS, failedStage: "activate" };
      expect(stageStateOf(progress, "activate")).toBe("failed");
      expect(stageStateOf(progress, "tables")).not.toBe("failed");
    });

    it("is done per the completion table for venue/floorPlan/activate", () => {
      const progress: LaunchProgress = {
        ...INITIAL_LAUNCH_PROGRESS,
        venueId: "v1",
        floorPlanId: "fp1",
        activated: true,
      };
      expect(stageStateOf(progress, "venue")).toBe("done");
      expect(stageStateOf(progress, "floorPlan")).toBe("done");
      expect(stageStateOf(progress, "activate")).toBe("done");
    });

    it("is pending otherwise", () => {
      expect(stageStateOf(INITIAL_LAUNCH_PROGRESS, "venue")).toBe("pending");
      expect(stageStateOf(INITIAL_LAUNCH_PROGRESS, "floorPlan")).toBe("pending");
      expect(stageStateOf(INITIAL_LAUNCH_PROGRESS, "tables")).toBe("pending");
      expect(stageStateOf(INITIAL_LAUNCH_PROGRESS, "activate")).toBe("pending");
    });

    it("a stage is never both done and failed/in-flight", () => {
      const progress: LaunchProgress = {
        ...INITIAL_LAUNCH_PROGRESS,
        venueId: "v1",
        failedStage: "venue",
      };
      // failedStage wins over the completion check for its own stage.
      expect(stageStateOf(progress, "venue")).toBe("failed");
    });
  });

  describe("tablesDoneCount", () => {
    it("equals createdTableNames.length", () => {
      const progress: LaunchProgress = {
        ...INITIAL_LAUNCH_PROGRESS,
        createdTableNames: ["T1", "T2"],
      };
      expect(tablesDoneCount(progress)).toBe(2);
    });
  });

  describe("isAlreadyCreatedError", () => {
    it("is true for the server's duplicate-name rejection", () => {
      expect(isAlreadyCreatedError(new Error("A table with this name already exists"))).toBe(true);
    });

    it("is false for a generic Error, null, undefined and a string", () => {
      expect(isAlreadyCreatedError(new Error("Network error"))).toBe(false);
      expect(isAlreadyCreatedError(null)).toBe(false);
      expect(isAlreadyCreatedError(undefined)).toBe(false);
      expect(isAlreadyCreatedError("A table with this name already exists")).toBe(false);
    });
  });

  describe("runLaunchSequence", () => {
    it("happy path: calls land in order, onProgress fires, final progress is clean", async () => {
      const api = makeFakeApi();
      const draft = makeDraft();
      const onProgress = vi.fn();

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        onProgress
      );

      expect(api.callLog).toEqual([
        "venues.create",
        "floorPlans.create",
        "tables.create:T1",
        "tables.create:T2",
        "tables.create:T3",
        "floorPlans.setActive",
      ]);
      expect(onProgress).toHaveBeenCalled();
      expect(result.failedStage).toBeNull();
      expect(result.inFlightStage).toBeNull();
      expect(result.activated).toBe(true);
      expect(result.venueId).toBe("venue-1");
      expect(result.floorPlanId).toBe("floor-plan-1");
      expect(result.createdTableNames).toEqual(["T1", "T2", "T3"]);
    });

    it("posts the floorPlan create with the venueId, planName and DEFAULT_LAYOUT", async () => {
      const api = makeFakeApi();
      const draft = makeDraft({ planName: "Patio" });

      await runLaunchSequence(api, draft, VENUE_PAYLOAD, INITIAL_LAUNCH_PROGRESS, vi.fn());

      expect(api.floorPlans.create).toHaveBeenCalledWith({
        venueId: "venue-1",
        name: "Patio",
        layoutJson: DEFAULT_LAYOUT,
      });
    });

    it("at N = 0, posts no table and the sequence still activates", async () => {
      const api = makeFakeApi();
      const draft = makeDraft({ tables: [] });

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(api.tables.create).not.toHaveBeenCalled();
      expect(result.activated).toBe(true);
      expect(result.createdTableNames).toEqual([]);
    });

    it("stops at a venue failure without calling anything else, and returns instead of throwing", async () => {
      const api = makeFakeApi();
      api.venues.create = vi.fn().mockRejectedValue(new Error("Venue slug already exists"));
      const draft = makeDraft();

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(result.failedStage).toBe("venue");
      expect(result.errorMessage).toBe("Venue slug already exists");
      expect(result.inFlightStage).toBeNull();
      expect(api.floorPlans.create).not.toHaveBeenCalled();
    });

    it("stops at a floorPlan failure", async () => {
      const api = makeFakeApi();
      api.floorPlans.create = vi.fn().mockRejectedValue(new Error("Could not reach service"));
      const draft = makeDraft();

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(result.failedStage).toBe("floorPlan");
      expect(result.errorMessage).toBe("Could not reach service");
      expect(api.tables.create).not.toHaveBeenCalled();
    });

    it("stops at a tables failure, recording which table it stopped at", async () => {
      const api = makeFakeApi();
      api.tables.create = vi
        .fn()
        .mockImplementationOnce(async (data: { name: string }) => {
          api.callLog.push(`tables.create:${data.name}`);
          return makeTable(data.name);
        })
        .mockRejectedValueOnce(new Error("Table limit exceeded"));
      const draft = makeDraft();

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(result.failedStage).toBe("tables");
      expect(result.errorMessage).toBe("Table limit exceeded");
      expect(result.createdTableNames).toEqual(["T1"]);
      expect(api.floorPlans.setActive).not.toHaveBeenCalled();
    });

    it("stops at an activate failure", async () => {
      const api = makeFakeApi();
      api.floorPlans.setActive = vi.fn().mockRejectedValue(new Error("Could not activate"));
      const draft = makeDraft();

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(result.failedStage).toBe("activate");
      expect(result.errorMessage).toBe("Could not activate");
      expect(result.activated).toBe(false);
    });

    it("a mid-tables duplicate-name rejection counts that table as done and continues", async () => {
      const api = makeFakeApi();
      api.tables.create = vi
        .fn()
        .mockImplementationOnce(async (data: { name: string }) => {
          api.callLog.push(`tables.create:${data.name}`);
          return makeTable(data.name);
        })
        .mockRejectedValueOnce(new Error("A table with this name already exists"))
        .mockImplementationOnce(async (data: { name: string }) => {
          api.callLog.push(`tables.create:${data.name}`);
          return makeTable(data.name);
        });
      const draft = makeDraft();

      const result = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(result.failedStage).toBeNull();
      expect(result.createdTableNames).toEqual(["T1", "T2", "T3"]);
      expect(result.activated).toBe(true);
    });

    it("resumes from a venue failure by retrying venue creation until it succeeds", async () => {
      const api = makeFakeApi();
      const venuesCreateMock = vi.fn(async (_data: CreateVenueRequest) => {
        api.callLog.push("venues.create");
        return makeVenue();
      });
      venuesCreateMock.mockRejectedValueOnce(new Error("Rate limited"));
      api.venues.create = venuesCreateMock;
      const draft = makeDraft();

      const first = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );
      expect(first.failedStage).toBe("venue");
      expect(first.venueId).toBeNull();

      const second = await runLaunchSequence(api, draft, VENUE_PAYLOAD, first, vi.fn());

      expect(venuesCreateMock).toHaveBeenCalledTimes(2);
      expect(second.failedStage).toBeNull();
      expect(second.venueId).toBe("venue-1");
      expect(second.activated).toBe(true);
    });

    it("resumes from a floorPlan failure without re-posting the venue", async () => {
      const api = makeFakeApi();
      const floorPlansCreateMock = vi.fn(async () => {
        api.callLog.push("floorPlans.create");
        return makeFloorPlan();
      });
      floorPlansCreateMock.mockRejectedValueOnce(new Error("Timed out"));
      api.floorPlans.create = floorPlansCreateMock;
      const draft = makeDraft();

      const first = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );
      expect(first.failedStage).toBe("floorPlan");
      expect(first.venueId).toBe("venue-1");

      const second = await runLaunchSequence(api, draft, VENUE_PAYLOAD, first, vi.fn());

      expect(api.venues.create).toHaveBeenCalledTimes(1);
      expect(floorPlansCreateMock).toHaveBeenCalledTimes(2);
      expect(second.failedStage).toBeNull();
      expect(second.floorPlanId).toBe("floor-plan-1");
    });

    it("resumes from a table failure starting at the first uncreated table", async () => {
      const api = makeFakeApi();
      api.tables.create = vi
        .fn()
        .mockImplementationOnce(async (data: { name: string }) => {
          api.callLog.push(`tables.create:${data.name}`);
          return makeTable(data.name);
        })
        .mockRejectedValueOnce(new Error("Server error"));
      const draft = makeDraft();

      const first = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );
      expect(first.failedStage).toBe("tables");
      expect(first.createdTableNames).toEqual(["T1"]);

      api.tables.create = vi.fn(async (data: { name: string }) => {
        api.callLog.push(`tables.create:${data.name}`);
        return makeTable(data.name);
      });

      const second = await runLaunchSequence(api, draft, VENUE_PAYLOAD, first, vi.fn());

      expect(api.tables.create).toHaveBeenCalledTimes(2);
      expect(api.tables.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "T2" }));
      expect(api.tables.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "T3" }));
      expect(second.createdTableNames).toEqual(["T1", "T2", "T3"]);
      expect(second.failedStage).toBeNull();
    });

    it("resumes from an activate failure calling only setActive", async () => {
      const api = makeFakeApi();
      api.floorPlans.setActive = vi.fn().mockRejectedValueOnce(new Error("Server unavailable"));
      const draft = makeDraft();

      const first = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );
      expect(first.failedStage).toBe("activate");

      const second = await runLaunchSequence(api, draft, VENUE_PAYLOAD, first, vi.fn());

      expect(api.venues.create).toHaveBeenCalledTimes(1);
      expect(api.floorPlans.create).toHaveBeenCalledTimes(1);
      expect(api.tables.create).toHaveBeenCalledTimes(3);
      expect(api.floorPlans.setActive).toHaveBeenCalledTimes(2);
      expect(second.activated).toBe(true);
      expect(second.failedStage).toBeNull();
    });
  });
});
