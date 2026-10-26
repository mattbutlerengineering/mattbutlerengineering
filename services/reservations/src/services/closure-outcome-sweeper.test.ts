import { describe, expect, it, vi } from "vitest";
import { JOB_TYPES } from "../jobs/index.js";
import { closureRefundJobId } from "./closure-refund.js";
import { sweepClosureOutcomes, type ClosureOutcomeSweeperDeps } from "./closure-outcome-sweeper.js";
import { getCurrentVenueId } from "./venue-context-store.js";

const NOW = new Date("2026-10-26T12:00:00Z");

function makeDeps(overrides: Partial<ClosureOutcomeSweeperDeps> = {}) {
  const contexts: { call: string; venueId: string | null }[] = [];
  const schedule = vi.fn(async () => "id");
  const enqueueForClosure = vi.fn(async () => 1);
  const deps: ClosureOutcomeSweeperDeps = {
    getVenueIds: async () => ["v1"],
    store: {
      listStuckRefunds: vi.fn(async () => {
        contexts.push({ call: "refunds", venueId: getCurrentVenueId() });
        return [];
      }),
      listStuckNotices: vi.fn(async () => {
        contexts.push({ call: "notices", venueId: getCurrentVenueId() });
        return [];
      }),
    },
    jobs: { schedule },
    notices: { enqueueForClosure },
    now: () => NOW,
    graceMs: 5 * 60_000,
    batchSize: 50,
    log: { error: vi.fn() },
    ...overrides,
  };
  return { deps, contexts, schedule, enqueueForClosure };
}

describe("sweepClosureOutcomes", () => {
  it("re-enqueues a stuck refund under the original job id and payload", async () => {
    const { deps, schedule } = makeDeps();
    vi.mocked(deps.store.listStuckRefunds).mockResolvedValueOnce([
      { id: "o1", dateRuleId: "r1", reservationId: "res1" },
    ]);

    const result = await sweepClosureOutcomes(deps);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(
      JOB_TYPES.CLOSURE_REFUND,
      { outcomeId: "o1", venueId: "v1" },
      0,
      closureRefundJobId("r1", "res1")
    );
    expect(result.refunds).toBe(1);
  });

  it("asks the store only for outcomes older than the grace period, bounded by batch size", async () => {
    const { deps } = makeDeps({ batchSize: 7 });

    await sweepClosureOutcomes(deps);

    const cutoff = new Date(NOW.getTime() - 5 * 60_000);
    expect(deps.store.listStuckRefunds).toHaveBeenCalledWith("v1", cutoff, 7);
    expect(deps.store.listStuckNotices).toHaveBeenCalledWith("v1", cutoff, 7);
  });

  it("enqueues nothing when no outcome is stuck", async () => {
    const { deps, schedule, enqueueForClosure } = makeDeps();

    const result = await sweepClosureOutcomes(deps);

    expect(schedule).not.toHaveBeenCalled();
    expect(enqueueForClosure).not.toHaveBeenCalled();
    expect(result).toEqual({ refunds: 0, notices: 0 });
  });

  it("re-enqueues notices once per closure through the notice service", async () => {
    const { deps, enqueueForClosure } = makeDeps();
    vi.mocked(deps.store.listStuckNotices).mockResolvedValueOnce([
      { id: "o1", dateRuleId: "r1", reservationId: "res1" },
      { id: "o2", dateRuleId: "r1", reservationId: "res2" },
      { id: "o3", dateRuleId: "r2", reservationId: "res3" },
    ]);

    const result = await sweepClosureOutcomes(deps);

    expect(enqueueForClosure).toHaveBeenCalledTimes(2);
    expect(enqueueForClosure).toHaveBeenCalledWith({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(enqueueForClosure).toHaveBeenCalledWith({ venueId: "v1", ruleId: "r2", now: NOW });
    expect(result.notices).toBe(3);
  });

  it("reads and enqueues inside each venue's RLS context", async () => {
    const seen: (string | null)[] = [];
    const { deps, contexts } = makeDeps({ getVenueIds: async () => ["v1", "v2"] });
    vi.mocked(deps.store.listStuckNotices).mockImplementation(async () => {
      seen.push(getCurrentVenueId());
      return [{ id: "o", dateRuleId: "r", reservationId: "x" }];
    });
    vi.mocked(deps.notices.enqueueForClosure).mockImplementation(async () => {
      seen.push(getCurrentVenueId());
      return 1;
    });

    await sweepClosureOutcomes(deps);

    expect(contexts.filter((c) => c.call === "refunds").map((c) => c.venueId)).toEqual([
      "v1",
      "v2",
    ]);
    expect(seen).toEqual(["v1", "v1", "v2", "v2"]);
  });

  it("keeps sweeping other venues when one venue fails", async () => {
    const { deps, schedule } = makeDeps({ getVenueIds: async () => ["bad", "v2"] });
    vi.mocked(deps.store.listStuckRefunds).mockImplementation(async (venueId) => {
      if (venueId === "bad") throw new Error("boom");
      return [{ id: "o9", dateRuleId: "r1", reservationId: "res9" }];
    });

    await sweepClosureOutcomes(deps);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(deps.log.error).toHaveBeenCalled();
  });

  it("still sweeps notices when the refund enqueue fails", async () => {
    const { deps, enqueueForClosure } = makeDeps();
    vi.mocked(deps.store.listStuckRefunds).mockResolvedValueOnce([
      { id: "o1", dateRuleId: "r1", reservationId: "res1" },
    ]);
    vi.mocked(deps.jobs.schedule).mockRejectedValueOnce(new Error("redis down"));
    vi.mocked(deps.store.listStuckNotices).mockResolvedValueOnce([
      { id: "o1", dateRuleId: "r1", reservationId: "res1" },
    ]);

    await sweepClosureOutcomes(deps);

    expect(enqueueForClosure).toHaveBeenCalledTimes(1);
    expect(deps.log.error).toHaveBeenCalled();
  });
});
