import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";

const loadClosureChanges = vi.fn();
vi.mock("../services/closure-changes.js", () => ({
  loadClosureChanges: (...args: unknown[]) => loadClosureChanges(...args),
}));

import { enqueueClosureJobs, publishClosureChanges } from "./closure-post-commit.js";

const settleClosure = vi.fn();
const enqueueRefunds = vi.fn();
const enqueueForClosure = vi.fn();
const fastify = {
  transitions: { settleClosure },
  closureRefunds: { enqueue: enqueueRefunds },
  services: { closureNoticeService: { enqueueForClosure } },
} as unknown as FastifyInstance;
const log = { error: vi.fn() } as unknown as FastifyBaseLogger;
const saved = { venueId: "venue-1", ruleId: "dr-1" };
const changes = { cancelled: [{ id: "r1" }, { id: "r2" }], moved: [{ id: "r3" }] };

describe("publishClosureChanges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("hands the committed cancels and moves of the rule to the transitions", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await publishClosureChanges(fastify, log, saved);

    expect(loadClosureChanges).toHaveBeenCalledWith("venue-1", "dr-1");
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
  beforeEach(() => vi.resetAllMocks());

  it("publishes the closure's SSE events alongside the refund and notice jobs", async () => {
    loadClosureChanges.mockResolvedValueOnce(changes);

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 1 });

    expect(settleClosure).toHaveBeenCalledTimes(1);
    expect(enqueueRefunds).toHaveBeenCalledWith("venue-1", "dr-1");
    expect(enqueueForClosure).toHaveBeenCalled();
  });

  it("still enqueues refunds and notices when publishing fails", async () => {
    loadClosureChanges.mockRejectedValueOnce(new Error("db down"));

    await enqueueClosureJobs(fastify, log, { ...saved, cancelled: 1 });

    expect(enqueueRefunds).toHaveBeenCalled();
    expect(enqueueForClosure).toHaveBeenCalled();
  });
});
