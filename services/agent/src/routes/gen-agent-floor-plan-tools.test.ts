import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

function createMockApiClient() {
  return { floorPlans: { list: vi.fn(), setActive: vi.fn() } };
}

/** What `ApiClientError` looks like to the tools: a status-bearing ProblemDetails. */
function problem(status: number, detail = "Refused.") {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

function plan(fields: Record<string, unknown>) {
  return {
    id: "p1",
    venueId: "v1",
    name: "Main Floor",
    isActive: true,
    layoutJson: { width: 100, height: 100 },
    tables: [{ capacity: 2 }, { capacity: 4 }],
    createdAt: "",
    updatedAt: "",
    ...fields,
  };
}

const PLANS = [
  plan({}),
  plan({ id: "p2", name: "Patio", isActive: false, tables: [{ capacity: 6 }] }),
];

describe("floor plan chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.floorPlans.list.mockResolvedValue({ data: PLANS });
    api.floorPlans.setActive.mockResolvedValue(plan({ id: "p2", name: "Patio" }));
  });

  function read(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, { venueId: "v1" });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  function run(input: Record<string, unknown>, venueId: string | null = "v1") {
    const tools = createAgentTools(log, api as never, {
      ...(venueId ? { venueId } : {}),
      confirmedAction: { actionId: "call-1", toolName: "activate_floor_plan", toolInput: input },
    });
    return tools.activate_floor_plan!.execute!(input as never, toolCtx);
  }

  it("registers activate_floor_plan as a confirm-gated write", () => {
    expect(GEN_WRITE_TOOL_NAMES).toContain("activate_floor_plan");
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("list_floor_plans");
  });

  it("lists plans with the active one and table counts and capacity", async () => {
    const result = await read("list_floor_plans", {});

    expect(api.floorPlans.list).toHaveBeenCalledWith({ venueId: "v1", limit: 100 });
    expect(result).toEqual({
      active: "Main Floor",
      floorPlans: [
        { name: "Main Floor", active: true, tables: 2, capacity: 6 },
        { name: "Patio", active: false, tables: 1, capacity: 6 },
      ],
    });
  });

  it("needs a selected venue to list", async () => {
    const tools = createAgentTools(log, api as never, {});

    const result = await tools.list_floor_plans!.execute!({} as never, toolCtx);

    expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
    expect(api.floorPlans.list).not.toHaveBeenCalled();
  });

  it("passes on a refused read in plain words", async () => {
    api.floorPlans.list.mockRejectedValue(problem(403));

    const result = await read("list_floor_plans", {});

    expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
  });

  describe("activate_floor_plan", () => {
    it("holds the change for the user's confirmation", async () => {
      const result = await read("activate_floor_plan", { floorPlan: "Patio" });

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.floorPlans.setActive).not.toHaveBeenCalled();
    });

    it("activates the plan by name, ignoring case", async () => {
      const result = await run({ floorPlan: " patio " });

      expect(api.floorPlans.setActive).toHaveBeenCalledWith("p2");
      expect(result).toMatchObject({ updated: true, floorPlan: "Patio" });
    });

    it("says so without a write when the plan is already active", async () => {
      const result = await run({ floorPlan: "Main Floor" });

      expect(result).toMatchObject({ alreadyActive: true, floorPlan: "Main Floor" });
      expect(api.floorPlans.setActive).not.toHaveBeenCalled();
    });

    it("names the plans there are when none matches", async () => {
      const result = await run({ floorPlan: "Rooftop" });

      expect(result).toMatchObject({ error: expect.stringContaining("Main Floor, Patio") });
      expect(api.floorPlans.setActive).not.toHaveBeenCalled();
    });

    it("asks a question when two plans share the name", async () => {
      api.floorPlans.list.mockResolvedValue({
        data: [plan({ id: "p3", name: "Patio", isActive: false, tables: [] }), ...PLANS],
      });

      const result = await run({ floorPlan: "Patio" });

      expect(result).toMatchObject({ error: expect.stringMatching(/2 floor plans.*Patio/) });
      expect(api.floorPlans.setActive).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const result = await run({ floorPlan: "Patio" }, null);

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
      expect(api.floorPlans.list).not.toHaveBeenCalled();
    });

    it("passes on a 403 in plain words", async () => {
      api.floorPlans.setActive.mockRejectedValue(problem(403));

      const result = await run({ floorPlan: "Patio" });

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    });

    it("passes on another refusal's reason", async () => {
      api.floorPlans.setActive.mockRejectedValue(problem(409, "Plan is locked."));

      const result = await run({ floorPlan: "Patio" });

      expect(result).toMatchObject({
        refused: true,
        error: "Plan is locked. Nothing was changed.",
      });
    });

    it.each([
      ["a 502", () => problem(502)],
      ["a timeout", () => new DOMException("The operation timed out.", "TimeoutError")],
      ["a lost response", () => new TypeError("fetch failed")],
    ])("after %s, may have saved: says to check list_floor_plans first", async (_name, failure) => {
      api.floorPlans.setActive.mockRejectedValue(failure());

      const result = await run({ floorPlan: "Patio" });

      expect(result).toMatchObject({
        error: expect.stringMatching(/Couldn't confirm.*list_floor_plans before trying again/),
      });
      expect(JSON.stringify(result)).not.toMatch(/Nothing was changed/);
    });

    it("still says nothing changed when the read before the write fails", async () => {
      api.floorPlans.list.mockRejectedValue(problem(502));

      const result = await run({ floorPlan: "Patio" });

      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
      expect(api.floorPlans.setActive).not.toHaveBeenCalled();
    });
  });
});
