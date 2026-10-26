import { describe, expect, it, vi } from "vitest";
import { JOB_TYPES } from "../jobs/index.js";
import { closureNoticeJobId } from "./closure-notice-service.js";
import { closureRefundJobId } from "./closure-refund.js";
import { sweepClosureOutcomes, type ClosureOutcomeSweeperDeps } from "./closure-outcome-sweeper.js";
import { getCurrentVenueId } from "./venue-context-store.js";

const NOW = new Date("2026-10-26T12:00:00Z");

function makeDeps(overrides: Partial<ClosureOutcomeSweeperDeps> = {}) {
  const contexts: { call: string; venueId: string | null }[] = [];
  const requeue = vi.fn<ClosureOutcomeSweeperDeps["jobs"]["requeue"]>(async () => "requeued");
  const isUrgent = vi.fn<ClosureOutcomeSweeperDeps["notices"]["isUrgent"]>(async () => false);
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
    jobs: { requeue },
    notices: { isUrgent },
    now: () => NOW,
    graceMs: 5 * 60_000,
    batchSize: 50,
    log: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  };
  return { deps, contexts, requeue, isUrgent };
}

const stuck = (id: string, ruleId = "r1", reservationId = `res-${id}`) => ({
  id,
  dateRuleId: ruleId,
  reservationId,
});

describe("sweepClosureOutcomes", () => {
  it("requeues a stuck refund under the original job id and payload", async () => {
    const { deps, requeue } = makeDeps();
    vi.mocked(deps.store.listStuckRefunds).mockResolvedValueOnce([stuck("o1", "r1", "res1")]);

    const result = await sweepClosureOutcomes(deps);

    expect(requeue).toHaveBeenCalledTimes(1);
    expect(requeue).toHaveBeenCalledWith(
      JOB_TYPES.CLOSURE_REFUND,
      { outcomeId: "o1", venueId: "v1" },
      closureRefundJobId("r1", "res1")
    );
    expect(result.refunds).toEqual({ requeued: 1, live: 0 });
  });

  it("counts a job still live in the queue as a dedupe, not a requeue, and logs it", async () => {
    const { deps, requeue } = makeDeps();
    requeue.mockResolvedValue("live");
    vi.mocked(deps.store.listStuckRefunds).mockResolvedValueOnce([stuck("o1")]);

    const result = await sweepClosureOutcomes(deps);

    expect(result.refunds).toEqual({ requeued: 0, live: 1 });
    expect(deps.log.info).toHaveBeenCalled();
  });

  it("asks the store only for outcomes older than the grace period, bounded by batch size", async () => {
    const { deps } = makeDeps({ batchSize: 7 });

    await sweepClosureOutcomes(deps);

    const cutoff = new Date(NOW.getTime() - 5 * 60_000);
    expect(deps.store.listStuckRefunds).toHaveBeenCalledWith("v1", cutoff, 7);
    expect(deps.store.listStuckNotices).toHaveBeenCalledWith("v1", cutoff, 7);
  });

  it("enqueues nothing when no outcome is stuck", async () => {
    const { deps, requeue } = makeDeps();

    const result = await sweepClosureOutcomes(deps);

    expect(requeue).not.toHaveBeenCalled();
    expect(result).toEqual({
      refunds: { requeued: 0, live: 0 },
      notices: { requeued: 0, live: 0 },
    });
  });

  it("requeues only the stuck outcomes' notices, each under its own base job id", async () => {
    const { deps, requeue, isUrgent } = makeDeps();
    isUrgent.mockImplementation(async ({ ruleId }) => ruleId === "r2");
    vi.mocked(deps.store.listStuckNotices).mockResolvedValueOnce([
      stuck("o1", "r1"),
      stuck("o3", "r2"),
    ]);

    const result = await sweepClosureOutcomes(deps);

    expect(requeue).toHaveBeenCalledTimes(2);
    expect(requeue).toHaveBeenCalledWith(
      JOB_TYPES.CLOSURE_NOTICE,
      { outcomeId: "o1", venueId: "v1", variant: "closure", urgent: false },
      closureNoticeJobId("o1", "closure")
    );
    expect(requeue).toHaveBeenCalledWith(
      JOB_TYPES.CLOSURE_NOTICE,
      { outcomeId: "o3", venueId: "v1", variant: "closure", urgent: true },
      closureNoticeJobId("o3", "closure")
    );
    expect(isUrgent).toHaveBeenCalledTimes(2);
    expect(result.notices).toEqual({ requeued: 2, live: 0 });
  });

  it("computes urgency once per closure, not per outcome", async () => {
    const { deps, isUrgent } = makeDeps();
    vi.mocked(deps.store.listStuckNotices).mockResolvedValueOnce([
      stuck("o1", "r1"),
      stuck("o2", "r1"),
    ]);

    await sweepClosureOutcomes(deps);

    expect(isUrgent).toHaveBeenCalledTimes(1);
    expect(isUrgent).toHaveBeenCalledWith({ venueId: "v1", ruleId: "r1", now: NOW });
  });

  it("never touches an outcome the store did not return (delivered siblings stay alone)", async () => {
    const { deps, requeue } = makeDeps();
    // o2 is delivered, so the store does not list it; only o1 is stuck.
    vi.mocked(deps.store.listStuckNotices).mockResolvedValueOnce([stuck("o1", "r1")]);

    await sweepClosureOutcomes(deps);

    const ids = requeue.mock.calls.map(
      ([, payload]) => (payload as { outcomeId: string }).outcomeId
    );
    expect(ids).toEqual(["o1"]);
  });

  it("reads and enqueues inside each venue's RLS context", async () => {
    const seen: (string | null)[] = [];
    const { deps, contexts } = makeDeps({ getVenueIds: async () => ["v1", "v2"] });
    vi.mocked(deps.store.listStuckNotices).mockResolvedValue([stuck("o")]);
    vi.mocked(deps.notices.isUrgent).mockImplementation(async () => {
      seen.push(getCurrentVenueId());
      return false;
    });
    vi.mocked(deps.jobs.requeue).mockImplementation(async () => {
      seen.push(getCurrentVenueId());
      return "requeued";
    });

    await sweepClosureOutcomes(deps);

    expect(contexts.filter((c) => c.call === "refunds").map((c) => c.venueId)).toEqual([
      "v1",
      "v2",
    ]);
    expect(seen).toEqual(["v1", "v1", "v2", "v2"]);
  });

  it("keeps sweeping other venues when one venue fails", async () => {
    const { deps, requeue } = makeDeps({ getVenueIds: async () => ["bad", "v2"] });
    vi.mocked(deps.store.listStuckRefunds).mockImplementation(async (venueId) => {
      if (venueId === "bad") throw new Error("boom");
      return [stuck("o9")];
    });

    await sweepClosureOutcomes(deps);

    expect(requeue).toHaveBeenCalledTimes(1);
    expect(deps.log.error).toHaveBeenCalled();
  });

  it("still sweeps notices when the refund requeue fails", async () => {
    const { deps, requeue } = makeDeps();
    vi.mocked(deps.store.listStuckRefunds).mockResolvedValueOnce([stuck("o1")]);
    requeue.mockRejectedValueOnce(new Error("redis down"));
    vi.mocked(deps.store.listStuckNotices).mockResolvedValueOnce([stuck("o1")]);

    await sweepClosureOutcomes(deps);

    expect(requeue).toHaveBeenCalledTimes(2);
    expect(deps.log.error).toHaveBeenCalled();
  });
});
