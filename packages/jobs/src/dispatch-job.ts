import { UnrecoverableError } from "bullmq";
import { JOB_TYPES } from "./job-types.js";
import type { JobType, JobHandlerMap, JobContext } from "./job-types.js";

const JOB_TYPE_SET: ReadonlySet<string> = new Set(Object.values(JOB_TYPES));

/**
 * UnrecoverableError makes BullMQ fail the job immediately: retrying a job
 * nobody can handle only burns attempts.
 */
export class UnknownJobTypeError extends UnrecoverableError {
  constructor(name: string, reason: "unknown-type" | "no-handler" = "unknown-type") {
    super(
      reason === "no-handler"
        ? `No handler registered for job type: "${name}"`
        : `Unknown job type: "${name}"`
    );
    this.name = "UnknownJobTypeError";
  }
}

export async function dispatchJob(
  handlers: JobHandlerMap,
  job: { name: string; data: unknown; updateData?: (data: never) => Promise<void> }
): Promise<void> {
  if (!JOB_TYPE_SET.has(job.name)) {
    throw new UnknownJobTypeError(job.name);
  }

  const jobType = job.name as JobType;
  const handler = (
    handlers as Partial<Record<JobType, (data: unknown, ctx: JobContext) => Promise<void>>>
  )[jobType];
  if (!handler) {
    throw new UnknownJobTypeError(jobType, "no-handler");
  }
  const ctx: JobContext = {
    updateData: async (patch) => {
      await (job.updateData as ((d: object) => Promise<void>) | undefined)?.({
        ...(job.data as object),
        ...patch,
      });
    },
  };
  await handler(job.data, ctx);
}
