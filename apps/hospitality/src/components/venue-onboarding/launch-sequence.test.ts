import { describe, it, expect, vi } from "vitest";
import { ApiClientError } from "@mbe/api-client";
import type { CreateVenueRequest, Venue, FloorPlan, FloorPlanSection, Table } from "@mbe/types";
import type { DraftTable, FloorPlanDraft } from "./floor-plan-draft.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../floor-plan/floor-plan-geometry.js";
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

const DUPLICATE_DETAIL = "A table with this name already exists";

function apiError(status: number, detail: string): ApiClientError {
  return new ApiClientError(
    { type: "about:blank", title: "Bad Request", status, detail },
    "POST",
    "/api/v1/tables"
  );
}

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
    templateId: null,
    sizeId: "cozy",
    planName: "Main Floor",
    tables: [
      makeDraftTable({ localId: "T1", name: "T1" }),
      makeDraftTable({ localId: "T2", name: "T2" }),
      makeDraftTable({ localId: "T3", name: "T3" }),
    ],
    sections: [],
    walls: [],
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pristine: false,
    ...overrides,
  };
}

/** A draft that names a room: its own canvas, a wall, and two named zones. */
function makeRoomDraft(overrides: Partial<FloorPlanDraft> = {}): FloorPlanDraft {
  return makeDraft({
    templateId: "fine-dining",
    sizeId: "standard",
    width: 1200,
    height: 800,
    walls: [{ id: "w1", x1: 0, y1: 0, x2: 1200, y2: 0, thickness: 6 }],
    sections: [
      {
        id: "fine-dining-main-dining",
        name: "Main Dining",
        color: "#8b7355",
        x: 24,
        y: 24,
        width: 600,
        height: 736,
      },
      {
        id: "fine-dining-private",
        name: "Private",
        color: "#6b5740",
        x: 744,
        y: 24,
        width: 432,
        height: 736,
      },
    ],
    ...overrides,
  });
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

function makeSection(name: string, venueId = "venue-1", floorPlanId = "floor-plan-1") {
  return {
    id: `section-${name}`,
    venueId,
    floorPlanId,
    name,
    color: "#8b7355",
    displayOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies FloorPlanSection;
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
      update: vi.fn(async () => {
        callLog.push("floorPlans.update");
        return makeFloorPlan();
      }),
      setActive: vi.fn(async () => {
        callLog.push("floorPlans.setActive");
        return { ...makeFloorPlan(), isActive: true };
      }),
    },
    floorPlanSections: {
      list: vi.fn(async () => {
        callLog.push("floorPlanSections.list");
        return [] as FloorPlanSection[];
      }),
      create: vi.fn(async (venueId: string, data: { floorPlanId: string; name: string }) => {
        callLog.push(`floorPlanSections.create:${data.name}`);
        return makeSection(data.name, venueId, data.floorPlanId);
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
        sectionsDone: false,
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
        sectionsDone: true,
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
        sectionsDone: true,
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
              sectionsDone: true,
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
        sectionsDone: true,
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
      expect(isAlreadyCreatedError(apiError(400, DUPLICATE_DETAIL))).toBe(true);
    });

    it("is false for a 400 with a different detail and for a non-400 with the same detail", () => {
      expect(isAlreadyCreatedError(apiError(400, "Name is required"))).toBe(false);
      expect(isAlreadyCreatedError(apiError(409, DUPLICATE_DETAIL))).toBe(false);
    });

    it("is false for a plain Error that merely carries the duplicate message", () => {
      expect(isAlreadyCreatedError(new Error(DUPLICATE_DETAIL))).toBe(false);
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

    it("emits an in-flight progress value for the venue stage before the stage resolves", async () => {
      const api = makeFakeApi();
      let resolveVenue: (venue: Venue) => void = () => {};
      const pending = new Promise<Venue>((resolve) => {
        resolveVenue = resolve;
      });
      api.venues.create = vi.fn(() => pending);
      const draft = makeDraft();
      const onProgress = vi.fn();

      const resultPromise = runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        onProgress
      );

      // Flush the microtask queue without resolving api.venues.create — the
      // synchronous "set inFlightStage" work must already have run.
      await Promise.resolve();

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ inFlightStage: "venue", venueId: null })
      );

      resolveVenue(makeVenue());
      await resultPromise;
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

    it("makes no section calls at all for a draft that names no zones", async () => {
      const api = makeFakeApi();

      await runLaunchSequence(api, makeDraft(), VENUE_PAYLOAD, INITIAL_LAUNCH_PROGRESS, vi.fn());

      expect(api.floorPlanSections.list).not.toHaveBeenCalled();
      expect(api.floorPlanSections.create).not.toHaveBeenCalled();
      expect(api.floorPlans.update).not.toHaveBeenCalled();
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
        .mockRejectedValueOnce(apiError(400, DUPLICATE_DETAIL))
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

  // A room template (#7256) gives the plan its own canvas, perimeter walls and
  // named zones. The zones are two writes inside the floorPlan stage, so the
  // resume contract has to cover a failure between them.
  describe("a draft that names a room", () => {
    it("saves the room's own canvas and walls on the plan", async () => {
      const api = makeFakeApi();
      const draft = makeRoomDraft({ planName: "Dining Room" });

      await runLaunchSequence(api, draft, VENUE_PAYLOAD, INITIAL_LAUNCH_PROGRESS, vi.fn());

      expect(api.floorPlans.create).toHaveBeenCalledWith({
        venueId: "venue-1",
        name: "Dining Room",
        layoutJson: {
          width: 1200,
          height: 800,
          gridSize: 20,
          showGrid: true,
          walls: draft.walls,
        },
      });
    });

    it("creates one section row per zone, in order, then writes their rectangles", async () => {
      const api = makeFakeApi();
      const draft = makeRoomDraft();

      await runLaunchSequence(api, draft, VENUE_PAYLOAD, INITIAL_LAUNCH_PROGRESS, vi.fn());

      expect(api.floorPlanSections.create).toHaveBeenCalledTimes(2);
      expect(api.floorPlanSections.create).toHaveBeenNthCalledWith(1, "venue-1", {
        floorPlanId: "floor-plan-1",
        name: "Main Dining",
        color: "#8b7355",
        displayOrder: 0,
      });
      expect(api.floorPlans.update).toHaveBeenCalledWith("floor-plan-1", {
        layoutJson: {
          width: 1200,
          height: 800,
          gridSize: 20,
          showGrid: true,
          walls: draft.walls,
          // Keyed by the ids the server minted, never the builder's local ones.
          sections: [
            { id: "section-Main Dining", x: 24, y: 24, width: 600, height: 736 },
            { id: "section-Private", x: 744, y: 24, width: 432, height: 736 },
          ],
        },
      });
    });

    it("orders the zones after the plan and before the tables", async () => {
      const api = makeFakeApi();

      await runLaunchSequence(
        api,
        makeRoomDraft(),
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(api.callLog).toEqual([
        "venues.create",
        "floorPlans.create",
        "floorPlanSections.list",
        "floorPlanSections.create:Main Dining",
        "floorPlanSections.create:Private",
        "floorPlans.update",
        "tables.create:T1",
        "tables.create:T2",
        "tables.create:T3",
        "floorPlans.setActive",
      ]);
    });

    it("holds the floorPlan stage open when the zones fail, keeping the plan it made", async () => {
      const api = makeFakeApi();
      api.floorPlanSections.create = vi.fn(async () => {
        throw new Error("sections rejected");
      });

      const progress = await runLaunchSequence(
        api,
        makeRoomDraft(),
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(progress.failedStage).toBe("floorPlan");
      expect(progress.floorPlanId).toBe("floor-plan-1");
      expect(progress.sectionsDone).toBe(false);
      expect(api.tables.create).not.toHaveBeenCalled();
      // Not done, so Retry comes back to this stage rather than skipping it.
      expect(nextStage(progress, makeRoomDraft())).toBe("floorPlan");
    });

    it("resumes the zones without creating a second plan", async () => {
      const api = makeFakeApi();
      let failed = false;
      api.floorPlanSections.create = vi.fn(async (venueId: string, data: { name: string }) => {
        if (!failed) {
          failed = true;
          throw new Error("sections rejected");
        }
        api.callLog.push(`floorPlanSections.create:${data.name}`);
        return makeSection(data.name, venueId);
      });

      const draft = makeRoomDraft();
      const first = await runLaunchSequence(
        api,
        draft,
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );
      const second = await runLaunchSequence(api, draft, VENUE_PAYLOAD, first, vi.fn());

      expect(api.floorPlans.create).toHaveBeenCalledTimes(1);
      expect(second.sectionsDone).toBe(true);
      expect(second.activated).toBe(true);
      expect(second.failedStage).toBeNull();
    });

    it("skips a zone a prior attempt already created, matching on its name", async () => {
      const api = makeFakeApi();
      api.floorPlanSections.list = vi.fn(async () => [makeSection("Main Dining")]);

      await runLaunchSequence(
        api,
        makeRoomDraft(),
        VENUE_PAYLOAD,
        INITIAL_LAUNCH_PROGRESS,
        vi.fn()
      );

      expect(api.floorPlanSections.create).toHaveBeenCalledTimes(1);
      expect(api.floorPlanSections.create).toHaveBeenCalledWith(
        "venue-1",
        expect.objectContaining({ name: "Private" })
      );
    });
  });
});
