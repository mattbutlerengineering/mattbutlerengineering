import { Job } from "bullmq";
import type { Queue } from "bullmq";
import { describe, expect, it } from "vitest";
import { JOB_TYPES } from "../jobs/job-types.js";
import { reminderJobId } from "./plan.js";

// Minimal queue stand-in: validateOptions only reads opts, never the datastore.
const fakeQueue = {
  client: Promise.resolve({}),
  opts: {},
  toKey: () => "",
  keys: {},
  closing: null,
  trace: async (_a: unknown, _b: unknown, fn: () => unknown) => fn(),
} as unknown as Queue;

function validate(jobType: string, jobId: string): void {
  // validateOptions is protected in the typings but is what Queue.add runs.
  const job = new Job(fakeQueue, jobType, {}, { jobId }) as unknown as {
    validateOptions(jobData: unknown): void;
  };
  job.validateOptions({});
}

describe("custom BullMQ job ids", () => {
  it.each([JOB_TYPES.BOOKING_REMINDER, JOB_TYPES.DAY_OF_REMINDER])(
    "reminderJobId for %s passes BullMQ validation",
    (jobType) => {
      expect(() => validate(jobType, reminderJobId(jobType, "res-123"))).not.toThrow();
    }
  );
});
