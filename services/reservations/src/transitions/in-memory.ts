/**
 * In-memory adapters for the transition ports — recorders that tests use in
 * place of the production adapters (architecture.md "In-memory").
 */
import type {
  EventsPort,
  GuestMessage,
  GuestMessageKind,
  JobsPort,
  LiveEvent,
  MessagingPort,
} from "./ports.js";

export interface InMemoryMessaging extends MessagingPort {
  readonly sent: readonly GuestMessage[];
  /** Make the next send of `kind` reject (once). */
  failNext(kind: GuestMessageKind, error?: Error): void;
}

export function createInMemoryMessaging(): InMemoryMessaging {
  const sent: GuestMessage[] = [];
  const failures = new Map<GuestMessageKind, Error>();
  return {
    sent,
    failNext(kind, error = new Error(`scripted ${kind} failure`)) {
      failures.set(kind, error);
    },
    async send(message) {
      const failure = failures.get(message.kind);
      if (failure) {
        failures.delete(message.kind);
        throw failure;
      }
      sent.push(message);
    },
  };
}

export interface InMemoryJob {
  jobType: string;
  delayMs: number;
  payload: unknown;
}

export interface InMemoryJobs extends JobsPort {
  readonly jobs: ReadonlyMap<string, InMemoryJob>;
}

export function createInMemoryJobs(): InMemoryJobs {
  const jobs = new Map<string, InMemoryJob>();
  return {
    jobs,
    async schedule(jobType, payload, delayMs, jobId) {
      const id = jobId ?? `${jobType}:${jobs.size}`;
      jobs.set(id, { jobType, delayMs, payload });
      return id;
    },
    async cancel(jobId) {
      return jobs.delete(jobId);
    },
  };
}

export interface InMemoryEvents extends EventsPort {
  readonly published: readonly LiveEvent[];
}

export function createInMemoryEvents(): InMemoryEvents {
  const published: LiveEvent[] = [];
  return {
    published,
    publish(event) {
      published.push(event);
    },
  };
}
