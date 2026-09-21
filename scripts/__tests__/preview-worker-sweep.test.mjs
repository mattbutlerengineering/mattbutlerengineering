import { describe, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePreviewWorkerName,
  normalizePrState,
  decidePreviewWorkerSweep,
  planPreviewSweep,
  classifyDeleteOutcome,
  runPreviewSweep,
} from "../preview-worker-sweep.mjs";
import { findOrphanedWorkers } from "../resource-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REAL_ALLOWLIST = JSON.parse(
  readFileSync(resolve(__dirname, "../../infrastructure/resource-allowlist.json"), "utf8")
);

// ---------------------------------------------------------------------------
// parsePreviewWorkerName — the name is the only thing that makes a worker ours
// ---------------------------------------------------------------------------

describe("parsePreviewWorkerName", () => {
  test("parses the PR number and app out of a preview worker name", () => {
    expect(parsePreviewWorkerName("mbe-preview-5555-marketing")).toEqual({
      pr: 5555,
      app: "marketing",
    });
  });

  test("keeps a hyphenated app segment whole", () => {
    expect(parsePreviewWorkerName("mbe-preview-2203-rialto-web")).toEqual({
      pr: 2203,
      app: "rialto-web",
    });
  });

  test("returns null for eat-sheet — a separate live project in the same account", () => {
    expect(parsePreviewWorkerName("eat-sheet")).toBeNull();
  });

  test("returns null for butler-api — pre-existing, not managed by this repo", () => {
    expect(parsePreviewWorkerName("butler-api")).toBeNull();
  });

  test("returns null for a worker that merely shares the prefix word", () => {
    expect(parsePreviewWorkerName("mbe-preview")).toBeNull();
    expect(parsePreviewWorkerName("mattbutlerengineering-edge-router")).toBeNull();
  });

  test("boundary: refuses a non-numeric PR segment", () => {
    expect(parsePreviewWorkerName("mbe-preview-abc-marketing")).toBeNull();
  });

  test("boundary: refuses a missing app segment", () => {
    expect(parsePreviewWorkerName("mbe-preview-5555-")).toBeNull();
    expect(parsePreviewWorkerName("mbe-preview-5555")).toBeNull();
  });

  test("boundary: anchors the pattern at both ends", () => {
    expect(parsePreviewWorkerName("prod-mbe-preview-5555-marketing")).toBeNull();
    expect(parsePreviewWorkerName("mbe-preview-5555-marketing-live")).toEqual({
      pr: 5555,
      app: "marketing-live",
    });
  });

  test("boundary: tolerates a non-string input rather than throwing", () => {
    expect(parsePreviewWorkerName(undefined)).toBeNull();
    expect(parsePreviewWorkerName(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizePrState — fail closed on anything unrecognised
// ---------------------------------------------------------------------------

describe("normalizePrState", () => {
  test("maps OPEN to open", () => {
    expect(normalizePrState("OPEN")).toBe("open");
  });

  test("maps CLOSED to closed", () => {
    expect(normalizePrState("CLOSED")).toBe("closed");
  });

  test("maps MERGED to closed — a merged PR's preview is just as dead", () => {
    expect(normalizePrState("MERGED")).toBe("closed");
  });

  test("is case-insensitive", () => {
    expect(normalizePrState("open")).toBe("open");
    expect(normalizePrState("Merged")).toBe("closed");
  });

  test("fails closed on an absent, empty, or unrecognised state", () => {
    expect(normalizePrState(undefined)).toBe("unknown");
    expect(normalizePrState(null)).toBe("unknown");
    expect(normalizePrState("")).toBe("unknown");
    expect(normalizePrState("LOCKED")).toBe("unknown");
    expect(normalizePrState(42)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// decidePreviewWorkerSweep — the load-bearing decision
// ---------------------------------------------------------------------------

describe("decidePreviewWorkerSweep", () => {
  test("deletes a preview whose PR is closed", () => {
    expect(
      decidePreviewWorkerSweep({
        name: "mbe-preview-5555-marketing",
        prStates: { 5555: "CLOSED" },
      })
    ).toEqual({
      name: "mbe-preview-5555-marketing",
      action: "delete",
      reason: "pr-closed",
      pr: 5555,
      app: "marketing",
    });
  });

  test("deletes a preview whose PR is merged", () => {
    const decision = decidePreviewWorkerSweep({
      name: "mbe-preview-5555-marketing",
      prStates: { 5555: "MERGED" },
    });
    expect(decision.action).toBe("delete");
  });

  test("refuses a preview whose PR is still open", () => {
    expect(
      decidePreviewWorkerSweep({
        name: "mbe-preview-9001-hospitality",
        prStates: { 9001: "OPEN" },
      })
    ).toEqual({
      name: "mbe-preview-9001-hospitality",
      action: "skip",
      reason: "pr-open",
      pr: 9001,
      app: "hospitality",
    });
  });

  test("refuses a worker whose name does not match the preview pattern", () => {
    expect(decidePreviewWorkerSweep({ name: "eat-sheet", prStates: {} })).toEqual({
      name: "eat-sheet",
      action: "skip",
      reason: "not-a-preview-worker",
    });
  });

  test("refuses when the PR state could not be determined at all", () => {
    expect(decidePreviewWorkerSweep({ name: "mbe-preview-5555-marketing", prStates: {} })).toEqual({
      name: "mbe-preview-5555-marketing",
      action: "skip",
      reason: "pr-state-unknown",
      pr: 5555,
      app: "marketing",
    });
  });

  test("refuses when the PR state is present but unrecognised", () => {
    const decision = decidePreviewWorkerSweep({
      name: "mbe-preview-5555-marketing",
      prStates: { 5555: "???" },
    });
    expect(decision).toMatchObject({ action: "skip", reason: "pr-state-unknown" });
  });

  test("accepts a Map of PR states as well as a plain object", () => {
    const decision = decidePreviewWorkerSweep({
      name: "mbe-preview-5555-marketing",
      prStates: new Map([[5555, "CLOSED"]]),
    });
    expect(decision.action).toBe("delete");
  });
});

// ---------------------------------------------------------------------------
// planPreviewSweep — pure batch plan
// ---------------------------------------------------------------------------

describe("planPreviewSweep", () => {
  const workers = [
    "mbe-preview-1-marketing",
    "mbe-preview-2-hospitality",
    "mbe-preview-3-rialto-web",
    "eat-sheet",
    "butler-api",
  ];
  const prStates = { 1: "MERGED", 2: "OPEN" };

  test("selects only the closed-PR previews", () => {
    const plan = planPreviewSweep({ workers, prStates });
    const deletions = plan.filter((d) => d.action === "delete").map((d) => d.name);
    expect(deletions).toEqual(["mbe-preview-1-marketing"]);
  });

  test("returns a decision for every worker, never dropping one silently", () => {
    expect(planPreviewSweep({ workers, prStates })).toHaveLength(workers.length);
  });

  test("does not mutate its input", () => {
    const frozen = Object.freeze([...workers]);
    expect(() => planPreviewSweep({ workers: frozen, prStates })).not.toThrow();
  });

  test("boundary: an absent worker list is an empty plan, not a throw", () => {
    expect(planPreviewSweep({ workers: undefined, prStates: {} })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// classifyDeleteOutcome — an already-gone worker is success, not failure
// ---------------------------------------------------------------------------

describe("classifyDeleteOutcome", () => {
  test("200 is a delete", () => {
    expect(classifyDeleteOutcome(200)).toBe("deleted");
  });

  test("404 is already-gone and must not fail the job", () => {
    expect(classifyDeleteOutcome(404)).toBe("already-gone");
  });

  test("403 and 500 are failures", () => {
    expect(classifyDeleteOutcome(403)).toBe("failed");
    expect(classifyDeleteOutcome(500)).toBe("failed");
  });

  test("boundary: a missing status is a failure, never a silent success", () => {
    expect(classifyDeleteOutcome(undefined)).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// runPreviewSweep — thin wrapper; dry-run by default
// ---------------------------------------------------------------------------

const sweepDeps = (overrides = {}) => ({
  listWorkers: async () => ["mbe-preview-1-marketing", "mbe-preview-2-hospitality", "eat-sheet"],
  getPrState: async (pr) => (pr === 1 ? "MERGED" : "OPEN"),
  deleteWorker: vi.fn(async () => 200),
  log: () => {},
  ...overrides,
});

describe("runPreviewSweep", () => {
  test("deletes nothing when not confirmed — dry run is the default", async () => {
    const deps = sweepDeps();
    const summary = await runPreviewSweep(deps);
    expect(deps.deleteWorker).not.toHaveBeenCalled();
    expect(summary.dryRun).toBe(true);
    expect(summary.planned).toEqual(["mbe-preview-1-marketing"]);
  });

  test("deletes only the closed-PR previews when confirmed", async () => {
    const deps = sweepDeps();
    const summary = await runPreviewSweep({ ...deps, confirm: true });
    expect(deps.deleteWorker.mock.calls.map((call) => call[0])).toEqual([
      "mbe-preview-1-marketing",
    ]);
    expect(summary.deleted).toEqual(["mbe-preview-1-marketing"]);
    expect(summary.failed).toEqual([]);
  });

  test("tolerates a worker that is already gone", async () => {
    const deps = sweepDeps({ deleteWorker: vi.fn(async () => 404) });
    const summary = await runPreviewSweep({ ...deps, confirm: true });
    expect(summary.alreadyGone).toEqual(["mbe-preview-1-marketing"]);
    expect(summary.failed).toEqual([]);
  });

  test("records a real delete failure without aborting the batch", async () => {
    const deps = sweepDeps({
      listWorkers: async () => ["mbe-preview-1-marketing", "mbe-preview-3-rialto-web"],
      getPrState: async () => "CLOSED",
      deleteWorker: vi.fn(async (name) => (name === "mbe-preview-1-marketing" ? 403 : 200)),
    });
    const summary = await runPreviewSweep({ ...deps, confirm: true });
    expect(summary.failed).toEqual(["mbe-preview-1-marketing"]);
    expect(summary.deleted).toEqual(["mbe-preview-3-rialto-web"]);
  });

  test("a thrown deleteWorker is a failure, not a crash", async () => {
    const deps = sweepDeps({
      deleteWorker: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    const summary = await runPreviewSweep({ ...deps, confirm: true });
    expect(summary.failed).toEqual(["mbe-preview-1-marketing"]);
  });

  test("fails closed when the PR-state lookup throws — never deletes on unknown", async () => {
    const deps = sweepDeps({
      getPrState: async () => {
        throw new Error("gh exploded");
      },
    });
    const summary = await runPreviewSweep({ ...deps, confirm: true });
    expect(deps.deleteWorker).not.toHaveBeenCalled();
    expect(summary.skipped).toContain("mbe-preview-1-marketing");
  });

  test("looks a PR up exactly once even when it owns several previews", async () => {
    const getPrState = vi.fn(async () => "CLOSED");
    const deps = sweepDeps({
      listWorkers: async () => ["mbe-preview-7-marketing", "mbe-preview-7-hospitality"],
      getPrState,
    });
    await runPreviewSweep({ ...deps, confirm: true });
    expect(getPrState).toHaveBeenCalledTimes(1);
  });

  test("never looks up a PR for a non-preview worker", async () => {
    const getPrState = vi.fn(async () => "CLOSED");
    const deps = sweepDeps({ listWorkers: async () => ["eat-sheet", "butler-api"], getPrState });
    const summary = await runPreviewSweep({ ...deps, confirm: true });
    expect(getPrState).not.toHaveBeenCalled();
    expect(summary.deleted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Allowlist seam — an entry resource-audit.mjs cannot read suppresses nothing
// ---------------------------------------------------------------------------

describe("resource-allowlist.json workers entries", () => {
  test("suppress butler-api and eat-sheet through the real audit comparison", () => {
    expect(findOrphanedWorkers(["butler-api", "eat-sheet"], new Set(), REAL_ALLOWLIST)).toEqual([]);
  });

  test("still flag a genuinely unexpected worker", () => {
    expect(findOrphanedWorkers(["mystery-worker"], new Set(), REAL_ALLOWLIST)).toEqual([
      "mystery-worker",
    ]);
  });

  test("every workers entry carries a reason a human can act on", () => {
    expect(REAL_ALLOWLIST.workers.length).toBeGreaterThan(0);
    for (const entry of REAL_ALLOWLIST.workers) {
      expect(typeof entry.name).toBe("string");
      expect(entry.reason ?? "").not.toBe("");
    }
  });

  test("does not allowlist any mbe-preview-* worker — those must be swept, not excused", () => {
    const excused = REAL_ALLOWLIST.workers.filter((e) => parsePreviewWorkerName(e.name) !== null);
    expect(excused).toEqual([]);
  });
});
