import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";

const loadClosureChanges = vi.fn();
vi.mock("../services/closure-changes.js", () => ({
  loadClosureChanges: (...args: unknown[]) => loadClosureChanges(...args),
}));

const carriedOutcomeIds = vi.fn();
vi.mock("../services/closure-carry-outcomes.js", () => ({
  readCarriedOutcomeIds: (...args: unknown[]) => carriedOutcomeIds(...args),
}));

const readGivenBack = vi.fn();
vi.mock("../services/closure-given-back.js", () => ({
  readGivenBack: (...args: unknown[]) => readGivenBack(...args),
}));

import { enqueueClosureJobs, publishClosureChanges } from "./closure-post-commit.js";

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
const saved = { venueId: "venue-1", ruleId: "dr-1" };
const changes = { cancelled: [{ id: "r1" }, { id: "r2" }], moved: [{ id: "r3" }] };

describe("publishClosureChanges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("hands the committed cancels and moves of the rule to the transitions", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await publishClosureChanges(fastify, log, saved);

    expect(loadClosureChanges).toHaveBeenCalledWith("venue-1", "dr-1", undefined);
    expect(settleClosure).toHaveBeenCalledWith("venue-1", changes);
  });

  it("logs, never throws, when publishing fails after the commit", async () => {
    loadClosureChanges.mockRejectedValueOnce(new Error("db down"));

    await expect(publishClosureChanges(fastify, log, saved)).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalled();
    expect(settleClosure).not.toHaveBeenCalled();
  });
});

describe("enqueueClosureJobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    carriedOutcomeIds.mockResolvedValue([]);
  });

  it("publishes the closure's SSE events alongside the refund and notice jobs", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 1 });

    expect(settleClosure).toHaveBeenCalledTimes(1);
    expect(enqueueRefunds).toHaveBeenCalledWith("venue-1", "dr-1", []);
    expect(enqueueForClosure).toHaveBeenCalled();
  });

  it("leaves the outcomes a series edit carried in out of the SSE, refund and notice steps (#7984)", async () => {
    carriedOutcomeIds.mockResolvedValueOnce(["o-old"]);
    loadClosureChanges.mockResolvedValueOnce(changes);

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 1 });

    expect(loadClosureChanges).toHaveBeenCalledWith("venue-1", "dr-1", ["o-old"]);
    expect(enqueueRefunds).toHaveBeenCalledWith("venue-1", "dr-1", ["o-old"]);
    expect(enqueueForClosure).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "dr-1", carried: ["o-old"] })
    );
  });

  it("falls back to every outcome of the rule, and says so, when the carried ones cannot be read", async () => {
    carriedOutcomeIds.mockRejectedValueOnce(new Error("db down"));
    loadClosureChanges.mockResolvedValueOnce(changes);

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 1 });

    expect(log.error).toHaveBeenCalled();
    expect(enqueueRefunds).toHaveBeenCalledWith("venue-1", "dr-1", []);
  });

  it("still enqueues refunds and notices when publishing fails", async () => {
    loadClosureChanges.mockRejectedValueOnce(new Error("db down"));

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 1 });

    expect(enqueueRefunds).toHaveBeenCalled();
    expect(enqueueForClosure).toHaveBeenCalled();
  });

  it("sends an edit's reopen notice to the guests it gave their date back to, through the reopen path (#8413)", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);
    readGivenBack.mockResolvedValueOnce({
      ruleId: "dr-old",
      outcomeIds: ["o1"],
      from: "2026-12-25",
    });

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 0, givenBackNotified: 1 });

    expect(readGivenBack).toHaveBeenCalledWith("venue-1", "dr-1");
    expect(enqueueForReopen).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "venue-1",
        ruleId: "dr-old",
        only: ["o1"],
        date: "2026-12-25",
      })
    );
  });

  it("sends no reopen notice when the save told no given-back guest", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 0 });

    expect(readGivenBack).not.toHaveBeenCalled();
    expect(enqueueForReopen).not.toHaveBeenCalled();
  });
});
