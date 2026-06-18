import { JOB_TYPES } from "./job-types.js";
import type { JobType } from "./job-types.js";
import type { JobHandlerMap } from "./worker.js";

const JOB_TYPE_SET: ReadonlySet<string> = new Set(Object.values(JOB_TYPES));

export class UnknownJobTypeError extends Error {
  constructor(name: string) {
    super(`Unknown job type: "${name}"`);
    this.name = "UnknownJobTypeError";
  }
}

export async function dispatchJob(
  handlers: JobHandlerMap,
  job: { name: string; data: unknown }
): Promise<void> {
  if (!JOB_TYPE_SET.has(job.name)) {
    throw new UnknownJobTypeError(job.name);
  }

  const jobType = job.name as JobType;
  const handler = (handlers as Record<JobType, (data: unknown) => Promise<void>>)[jobType];
  await handler(job.data);
}
