import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ClosurePostCommit } from "../services/closure-command.js";

const loadClosureChanges = vi.fn();
vi.mock("../services/closure-changes.js", () => ({
  loadClosureChanges: (...args: unknown[]) => loadClosureChanges(...args),
}));

import { runClosurePostCommit, runReopenNotice } from "./closure-post-commit.js";

const settleClosure = vi.fn();
const enqueueRefunds = vi.fn();
const enqueueForClosure = vi.fn();
const enqueueForReopen = vi.fn();
const fastify = {
  transitions: { settleClosure },
  closureRefunds: { enqueue: enqueueRefunds },
  services: { closureNoticeService: { enqueueForClosure, enqueueForReopen } },
} as unknown as FastifyInstance;
const log = { error: vi.fn() } as unknown as FastifyBaseLogger;
const changes = { cancelled: [{ id: "r1" }, { id: "r2" }], moved: [{ id: "r3" }] };
const plan = (patch: Partial<ClosurePostCommit> = {}): ClosurePostCommit => ({
  venueId: "venue-1",
  ruleId: "dr-1",
  carried: [],
  refunds: true,
  givenBack: null,
  ...patch,
});

describe("runClosurePostCommit", () => {
  beforeEach(() => vi.resetAllMocks());

  it("publishes the committed cancels and moves, then enqueues the refund and notice jobs", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await runClosurePostCommit(fastify, log, plan());

    expect(loadClosureChanges).toHaveBeenCalledWith("venue-1", "dr-1", []);
    expect(settleClosure).toHaveBeenCalledWith("venue-1", changes);
    expect(enqueueRefunds).toHaveBeenCalledWith("venue-1", "dr-1", []);
    expect(enqueueForClosure).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", ruleId: "dr-1", carried: [] })
    );
    expect(enqueueForReopen).not.toHaveBeenCalled();
  });

  it("leaves the outcomes a series edit carried in out of the SSE, refund and notice steps (#7984)", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await runClosurePostCommit(fastify, log, plan({ carried: ["o-old"] }));

    expect(loadClosureChanges).toHaveBeenCalledWith("venue-1", "dr-1", ["o-old"]);
    expect(enqueueRefunds).toHaveBeenCalledWith("venue-1", "dr-1", ["o-old"]);
    expect(enqueueForClosure).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "dr-1", carried: ["o-old"] })
    );
  });

  it("enqueues no refund job for a save that cancelled nobody", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await runClosurePostCommit(fastify, log, plan({ refunds: false }));

    expect(enqueueRefunds).not.toHaveBeenCalled();
    expect(enqueueForClosure).toHaveBeenCalled();
  });

  it("logs each failed step and still enqueues the notices after the commit", async () => {
    loadClosureChanges.mockRejectedValueOnce(new Error("db down"));
    enqueueRefunds.mockRejectedValueOnce(new Error("redis down"));

    await expect(runClosurePostCommit(fastify, log, plan())).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledTimes(2);
    expect(settleClosure).not.toHaveBeenCalled();
    expect(enqueueForClosure).toHaveBeenCalled();
  });

  it("sends an edit's reopen notice to the guests it gave their date back to, through the reopen path (#8413)", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);
    const givenBack = { ruleId: "dr-old", outcomeIds: ["o1"], from: "2026-12-25" };

    await runClosurePostCommit(fastify, log, plan({ refunds: false, givenBack }));

    expect(enqueueForReopen).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "venue-1",
        ruleId: "dr-old",
        only: ["o1"],
        date: "2026-12-25",
      })
    );
  });

  it("still sends the given-back notice when the closure notices fail to enqueue", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);
    enqueueForClosure.mockRejectedValueOnce(new Error("redis down"));
    const givenBack = { ruleId: "dr-old", outcomeIds: ["o1"], from: "2026-12-25" };

    await runClosurePostCommit(fastify, log, plan({ givenBack }));

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(enqueueForReopen).toHaveBeenCalled();
  });
});

describe("runReopenNotice", () => {
  beforeEach(() => vi.resetAllMocks());

  it("enqueues the reopen notice for the rule, one date only when the reopen was of one date", async () => {
    await runReopenNotice(fastify, log, { venueId: "venue-1", ruleId: "dr-1", date: "2026-12-24" });

    expect(enqueueForReopen).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", ruleId: "dr-1", date: "2026-12-24" })
    );
  });

  it("logs, never throws, when the queue is down after the commit", async () => {
    enqueueForReopen.mockRejectedValueOnce(new Error("redis down"));

    await expect(
      runReopenNotice(fastify, log, { venueId: "venue-1", ruleId: "dr-1" })
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });
});
