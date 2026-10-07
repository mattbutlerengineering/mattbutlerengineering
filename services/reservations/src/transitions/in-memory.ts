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
  PaymentsPort,
} from "./ports.js";
import { RETRIABLE_STRIPE_TYPES, StripeOperationError } from "../services/stripe.js";

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

export type PaymentsOp = keyof PaymentsPort;

type PaymentsImpl<Op extends PaymentsOp> = (
  ...args: Parameters<PaymentsPort[Op]>
) => Awaited<ReturnType<PaymentsPort[Op]>> | Promise<Awaited<ReturnType<PaymentsPort[Op]>>>;

export interface InMemoryPayments extends PaymentsPort {
  /** Every call, in order, with its arguments (idempotency keys included). */
  readonly calls: { op: PaymentsOp; args: unknown[] }[];
  /** Replace an op's default result (or make it throw) from now on. */
  respond<Op extends PaymentsOp>(op: Op, impl: PaymentsImpl<Op>): void;
  /** The next call to `op` throws a `StripeOperationError` of `stripeType`, as `StripeService` would. */
  failNext(op: PaymentsOp, stripeType: string): void;
}

/**
 * Payments recorder. Ids are deterministic per kind (`cus_mem_1`, `pi_mem_1`,
 * `re_mem_1`, ...); defaults model the happy path of each Stripe call.
 */
export function createInMemoryPayments(): InMemoryPayments {
  const calls: { op: PaymentsOp; args: unknown[] }[] = [];
  const counters = { cus: 0, pi: 0, re: 0 };
  const nextId = (kind: keyof typeof counters) => `${kind}_mem_${++counters[kind]}`;
  const failures = new Map<PaymentsOp, string>();

  const defaults: { [Op in PaymentsOp]: PaymentsImpl<Op> } = {
    createCustomer: (options) => ({
      id: nextId("cus"),
      email: options.email ?? null,
      name: options.name ?? null,
    }),
    createPaymentIntent: () => {
      const id = nextId("pi");
      return { id, status: "requires_payment_method", clientSecret: `${id}_secret` };
    },
    capturePaymentIntent: (id) => ({ id, status: "succeeded" }),
    cancelPaymentIntent: (id) => ({ id, status: "canceled" }),
    createPartialRefund: (_id, amount) => ({ id: nextId("re"), status: "succeeded", amount }),
    retrievePaymentIntent: (id) => ({ id, status: "requires_capture" }),
    findDepositRefund: () => null,
  };
  const impls: { [Op in PaymentsOp]: PaymentsImpl<Op> } = { ...defaults };

  function call<Op extends PaymentsOp>(op: Op): PaymentsPort[Op] {
    const recorded = async (...args: Parameters<PaymentsPort[Op]>) => {
      calls.push({ op, args });
      const stripeType = failures.get(op);
      if (stripeType !== undefined) {
        failures.delete(op);
        const cause = Object.assign(new Error(`${stripeType} (in-memory)`), { type: stripeType });
        throw new StripeOperationError(cause, stripeType, RETRIABLE_STRIPE_TYPES.has(stripeType));
      }
      return await (impls[op] as PaymentsImpl<Op>)(...args);
    };
    return recorded as unknown as PaymentsPort[Op];
  }

  return {
    calls,
    respond(op, impl) {
      (impls as Record<PaymentsOp, unknown>)[op] = impl;
    },
    failNext(op, stripeType) {
      failures.set(op, stripeType);
    },
    createCustomer: call("createCustomer"),
    createPaymentIntent: call("createPaymentIntent"),
    capturePaymentIntent: call("capturePaymentIntent"),
    cancelPaymentIntent: call("cancelPaymentIntent"),
    createPartialRefund: call("createPartialRefund"),
    retrievePaymentIntent: call("retrievePaymentIntent"),
    findDepositRefund: call("findDepositRefund"),
  };
}
