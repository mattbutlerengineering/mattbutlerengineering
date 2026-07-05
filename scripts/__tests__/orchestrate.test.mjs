import { describe, it, expect, vi } from "vitest";
import {
  deriveTaskZone,
  zonesConflict,
  planWaves,
  orchestrate,
  taskTelemetryRow,
  defaultTelemetryRecorder,
  defaultDispatch,
  extractPaths,
  normalizeLabels,
  issueToTask,
  summarize,
  READY_ISSUE_FIELDS,
} from "../orchestrate.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-07-04T00:00:00Z");

// Always-allow / always-block capacity gates so wave tests are isolated from
// the real ceiling logic (which has its own test in worker-dispatch.test.mjs).
const allowGate = () => ({ allowed: true, reason: "ok" });

// A task carrying an explicit zone — bypasses path derivation.
const zoneTask = (id, zone) => ({ id, zone });

// ---------------------------------------------------------------------------
// deriveTaskZone / zonesConflict — reuse of zoneForPaths semantics
// ---------------------------------------------------------------------------

describe("deriveTaskZone", () => {
  it("prefers an explicit zone, even null", () => {
    expect(deriveTaskZone({ zone: "apps/x", paths: ["packages/y/a.ts"] })).toBe("apps/x");
    expect(deriveTaskZone({ zone: null, paths: ["apps/x/a.ts"] })).toBe(null);
  });

  it("derives the zone from paths via zoneForPaths when zone is absent", () => {
    expect(deriveTaskZone({ paths: ["apps/hospitality/src/a.ts"] })).toBe("apps/hospitality");
    expect(deriveTaskZone({ paths: ["scripts/orchestrate.mjs"] })).toBe("root");
  });

  it("returns null (cross-cutting) when paths span multiple zones or are absent", () => {
    expect(deriveTaskZone({ paths: ["apps/x/a.ts", "packages/y/b.ts"] })).toBe(null);
    expect(deriveTaskZone({})).toBe(null);
  });

  it("accepts an injected zone deriver", () => {
    const spy = vi.fn(() => "packages/z");
    expect(deriveTaskZone({ paths: ["whatever"] }, spy)).toBe("packages/z");
    expect(spy).toHaveBeenCalledWith(["whatever"]);
  });
});

describe("zonesConflict", () => {
  it("distinct non-null zones are independent", () => {
    expect(zonesConflict("apps/a", "apps/b")).toBe(false);
  });

  it("equal zones contend for the same lock", () => {
    expect(zonesConflict("apps/a", "apps/a")).toBe(true);
  });

  it("a null (cross-cutting) zone conflicts with everything", () => {
    expect(zonesConflict(null, "apps/a")).toBe(true);
    expect(zonesConflict("apps/a", null)).toBe(true);
    expect(zonesConflict(null, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// planWaves — zone independence, conflict separation, capacity gating
// ---------------------------------------------------------------------------

describe("planWaves", () => {
  it("batches independent tasks (distinct zones) into a single wave", () => {
    const tasks = [
      zoneTask("a", "apps/a"),
      zoneTask("b", "packages/b"),
      zoneTask("c", "services/c"),
    ];
    const { waves } = planWaves({ tasks, activeWorkers: 0, maxWorkers: 3, canDispatch: allowGate });
    expect(waves).toHaveLength(1);
    expect(waves[0].map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("separates conflicting-zone tasks across successive waves", () => {
    const tasks = [
      zoneTask("a1", "apps/a"),
      zoneTask("a2", "apps/a"),
      zoneTask("a3", "apps/a"),
    ];
    const { waves } = planWaves({ tasks, activeWorkers: 0, maxWorkers: 3, canDispatch: allowGate });
    expect(waves).toHaveLength(3);
    expect(waves.map((w) => w[0].id)).toEqual(["a1", "a2", "a3"]);
  });

  it("gives a cross-cutting (null-zone) task its own solo wave", () => {
    const tasks = [zoneTask("a", "apps/a"), zoneTask("x", null), zoneTask("b", "packages/b")];
    const { waves } = planWaves({ tasks, activeWorkers: 0, maxWorkers: 3, canDispatch: allowGate });
    // a and b are independent but x (null) cannot share a wave with either.
    const xWave = waves.find((w) => w.some((t) => t.id === "x"));
    expect(xWave).toHaveLength(1);
    expect(xWave[0].id).toBe("x");
  });

  it("respects capacity: free slots (maxWorkers - activeWorkers) cap each wave", () => {
    const tasks = [
      zoneTask("a", "apps/a"),
      zoneTask("b", "packages/b"),
      zoneTask("c", "services/c"),
    ];
    // 2 workers already busy, ceiling 3 → only 1 free slot → 3 solo waves.
    const { waves, slotsPerWave } = planWaves({
      tasks,
      activeWorkers: 2,
      maxWorkers: 3,
      canDispatch: allowGate,
    });
    expect(slotsPerWave).toBe(1);
    expect(waves).toHaveLength(3);
    expect(waves.every((w) => w.length === 1)).toBe(true);
  });

  it("defers everything when the capacity gate blocks dispatch", () => {
    const tasks = [zoneTask("a", "apps/a"), zoneTask("b", "packages/b")];
    const blockGate = () => ({ allowed: false, reason: "worker-capacity" });
    const { waves, deferred, gate, slotsPerWave } = planWaves({
      tasks,
      canDispatch: blockGate,
    });
    expect(waves).toEqual([]);
    expect(deferred.map((t) => t.id)).toEqual(["a", "b"]);
    expect(gate.reason).toBe("worker-capacity");
    expect(slotsPerWave).toBe(0);
  });

  it("uses the REAL canDispatchWorkers gate by default (integration)", () => {
    const tasks = [zoneTask("a", "apps/a")];
    // Default gate: activeWorkers 0 < ceiling → allowed.
    expect(planWaves({ tasks }).gate.allowed).toBe(true);
    // At the default ceiling → blocked, task deferred.
    const atCeiling = planWaves({ tasks, activeWorkers: 3, maxWorkers: 3 });
    expect(atCeiling.gate.allowed).toBe(false);
    expect(atCeiling.deferred).toHaveLength(1);
  });

  it("derives zones from paths when tasks omit an explicit zone", () => {
    const tasks = [
      { id: "svc", paths: ["services/agent/src/a.ts"] },
      { id: "app", paths: ["apps/hospitality/src/b.ts"] },
    ];
    const { waves } = planWaves({ tasks, maxWorkers: 3, canDispatch: allowGate });
    expect(waves).toHaveLength(1);
    expect(waves[0].map((t) => t.zone)).toEqual(["services/agent", "apps/hospitality"]);
  });

  it("does not mutate its input tasks", () => {
    const tasks = [{ id: "a", paths: ["apps/a/x.ts"] }];
    planWaves({ tasks, canDispatch: allowGate });
    expect(tasks[0]).toEqual({ id: "a", paths: ["apps/a/x.ts"] });
  });
});

// ---------------------------------------------------------------------------
// orchestrate — wave-by-wave dispatch with injected dispatch + telemetry
// ---------------------------------------------------------------------------

describe("orchestrate", () => {
  it("dispatches every planned task exactly once, wave by wave", async () => {
    const tasks = [
      { id: "issue-1", issueNumber: 1, zone: "apps/a" },
      { id: "issue-2", issueNumber: 2, zone: "apps/a" }, // conflicts → wave 2
    ];
    const dispatch = vi.fn((task, ctx) => ({ id: task.id, wave: ctx.wave }));
    const result = await orchestrate({
      tasks,
      maxWorkers: 3,
      canDispatch: allowGate,
      dispatch,
      now: () => NOW,
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(result.plan.waves).toHaveLength(2);
    expect(result.dispatched.map((t) => t.id)).toEqual(["issue-1", "issue-2"]);
    // Each task was dispatched with its own wave index.
    expect(dispatch).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "issue-1" }), {
      wave: 0,
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "issue-2" }), {
      wave: 1,
    });
  });

  it("records one telemetry row per dispatched issue via the injected recorder", async () => {
    const tasks = [{ id: "issue-7", issueNumber: 7, zone: "apps/a", labels: ["ready", "acmm"] }];
    const recordTelemetry = vi.fn();
    await orchestrate({
      tasks,
      maxWorkers: 3,
      canDispatch: allowGate,
      dispatch: () => {},
      recordTelemetry,
      now: () => NOW,
    });

    expect(recordTelemetry).toHaveBeenCalledTimes(1);
    expect(recordTelemetry).toHaveBeenCalledWith({
      issue_number: 7,
      claimed_at: new Date(NOW).toISOString(),
      labels: ["ready", "acmm"],
    });
  });

  it("skips telemetry for tasks without a numeric issueNumber", async () => {
    const recordTelemetry = vi.fn();
    await orchestrate({
      tasks: [{ id: "adhoc", zone: "apps/a" }],
      maxWorkers: 3,
      canDispatch: allowGate,
      dispatch: () => {},
      recordTelemetry,
    });
    expect(recordTelemetry).not.toHaveBeenCalled();
  });

  it("dispatches nothing and reports blocked when at capacity", async () => {
    const dispatch = vi.fn();
    const log = vi.fn();
    const result = await orchestrate({
      tasks: [{ id: "issue-1", issueNumber: 1, zone: "apps/a" }],
      activeWorkers: 3,
      maxWorkers: 3, // real gate → blocked
      dispatch,
      log,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.dispatched).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("blocked"));
  });
});

// ---------------------------------------------------------------------------
// telemetry composition — real appendTelemetryRow through injected IO
// ---------------------------------------------------------------------------

describe("telemetry composition", () => {
  it("taskTelemetryRow shapes a schema-valid claim row", () => {
    expect(taskTelemetryRow({ issueNumber: 5 }, NOW)).toEqual({
      issue_number: 5,
      claimed_at: new Date(NOW).toISOString(),
    });
  });

  it("defaultTelemetryRecorder persists through appendTelemetryRow with injected IO", () => {
    const writes = [];
    const recorder = defaultTelemetryRecorder({
      readFile: () => null,
      writeFile: (_path, content) => writes.push(content),
    });
    const outcome = recorder(taskTelemetryRow({ issueNumber: 42 }, NOW));

    expect(outcome).toEqual({ written: true });
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0].trim())).toMatchObject({ issue_number: 42 });
  });

  it("orchestrate + defaultTelemetryRecorder writes a real (injected) JSONL row", async () => {
    const writes = [];
    const recorder = defaultTelemetryRecorder({
      readFile: () => null,
      writeFile: (_path, content) => writes.push(content),
    });
    await orchestrate({
      tasks: [{ id: "issue-9", issueNumber: 9, zone: "apps/a" }],
      maxWorkers: 3,
      canDispatch: allowGate,
      dispatch: () => {},
      recordTelemetry: recorder,
      now: () => NOW,
    });
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0].trim())).toMatchObject({ issue_number: 9 });
  });
});

// ---------------------------------------------------------------------------
// defaultDispatch — documented, side-effect-free
// ---------------------------------------------------------------------------

describe("defaultDispatch", () => {
  it("returns a documented (non-executed) dispatch descriptor", () => {
    const d = defaultDispatch({ id: "issue-3", title: "Fix bug", zone: "apps/a" }, { wave: 1 });
    expect(d).toMatchObject({ id: "issue-3", zone: "apps/a", wave: 1, dispatched: false, mode: "documented" });
    expect(d.command).toContain("gh workflow run agent-task.yml");
    expect(d.command).toContain("Fix bug");
  });
});

// ---------------------------------------------------------------------------
// Issue → task mapping (CLI input)
// ---------------------------------------------------------------------------

describe("extractPaths", () => {
  it("pulls backtick-quoted repo paths from an issue body", () => {
    const body = "Detection: `scripts/orchestrate.mjs` or `apps/hospitality/src/App.tsx`.";
    expect(extractPaths(body)).toEqual(["scripts/orchestrate.mjs", "apps/hospitality/src/App.tsx"]);
  });

  it("de-duplicates and tolerates trailing slashes and non-path backticks", () => {
    const body = "See `orchestrator/` and `orchestrator/` — but not `foo` or `x`.";
    expect(extractPaths(body)).toEqual(["orchestrator/"]);
  });

  it("returns [] for empty or non-string input", () => {
    expect(extractPaths("")).toEqual([]);
    expect(extractPaths(undefined)).toEqual([]);
  });
});

describe("normalizeLabels", () => {
  it("normalizes string and {name} label shapes", () => {
    expect(normalizeLabels(["ready", { name: "acmm" }])).toEqual(["ready", "acmm"]);
  });
  it("returns [] for non-array input", () => {
    expect(normalizeLabels(undefined)).toEqual([]);
  });
});

describe("issueToTask", () => {
  it("maps a gh issue record into a task descriptor with derived paths", () => {
    const task = issueToTask({
      number: 3122,
      title: "Multi-agent orchestration",
      body: "Detection: `scripts/orchestrate.mjs`.",
      labels: [{ name: "ready" }, { name: "acmm" }],
    });
    expect(task).toEqual({
      id: "issue-3122",
      issueNumber: 3122,
      title: "Multi-agent orchestration",
      paths: ["scripts/orchestrate.mjs"],
      labels: ["ready", "acmm"],
    });
  });

  it("planWaves places a root-zone issue task correctly end to end", () => {
    const task = issueToTask({ number: 1, body: "touches `scripts/orchestrate.mjs`" });
    const { waves } = planWaves({ tasks: [task], maxWorkers: 3, canDispatch: allowGate });
    expect(waves[0][0].zone).toBe("root");
  });
});

// ---------------------------------------------------------------------------
// summarize + constants
// ---------------------------------------------------------------------------

describe("summarize", () => {
  it("produces a compact printable plan summary", async () => {
    const result = await orchestrate({
      tasks: [
        { id: "issue-1", issueNumber: 1, zone: "apps/a" },
        { id: "issue-2", issueNumber: 2, zone: "apps/a" },
      ],
      maxWorkers: 3,
      canDispatch: allowGate,
      dispatch: () => {},
    });
    const s = summarize(result);
    expect(s.blocked).toBe(false);
    expect(s.waveCount).toBe(2);
    expect(s.dispatchedCount).toBe(2);
    expect(s.waves[0].tasks[0]).toEqual({ id: "issue-1", zone: "apps/a" });
  });
});

describe("constants", () => {
  it("declares the gh issue json fields", () => {
    expect(READY_ISSUE_FIELDS).toBe("number,title,body,labels");
  });
});
