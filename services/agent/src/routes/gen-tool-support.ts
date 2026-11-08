// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of user
import type { createApiClient } from "@mbe/api-client";

/** Helpers the chat's tool modules share. */

export type ApiClient = ReturnType<typeof createApiClient>;

export const NO_VENUE = {
  error: "No venue is selected. Ask the user to pick a venue in the app, then try again.",
} as const;

/** YYYY-MM-DD for `now` in `timeZone` (UTC when absent). */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Venue-local 24-hour `HH:mm` for an ISO time in `timeZone` (UTC when absent),
 * so the model never does time-zone arithmetic. Undefined, never a throw, when
 * the time or the zone can't be read.
 */
export function localTimeIn(iso: unknown, timeZone: string | undefined): string | undefined {
  if (typeof iso !== "string") return undefined;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone ?? "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  } catch {
    return undefined; // unknown time zone (RangeError)
  }
}

/**
 * What a failed tool logs. A logger writes every field of an error it is given: a refusal's problem
 * details can name guests, and the client's message and `path` hold the request's query, which can
 * be a guest search. So status and code, or the error's name, never the error itself. An error with
 * neither (a network failure) came from no response and holds no request data.
 */
export function failureLog(err: unknown) {
  const {
    problemDetails: problem,
    path,
    name,
  } = (err ?? {}) as {
    problemDetails?: { status?: unknown; code?: unknown };
    path?: unknown;
    name?: unknown;
  };
  if (problem) return { status: problem.status, code: problem.code };
  return path === undefined ? { err } : { failure: name };
}

/** A 4xx the server answered on purpose: what the caller sent was refused, so retrying cannot help. */
export interface Refusal {
  readonly status: number;
  readonly detail: string;
  readonly code?: string;
  readonly reason?: string;
}

/**
 * The RFC 7807 refusal inside an `ApiClientError`, or undefined for anything
 * transient (timeout, network, 5xx, 408, 429) and for non-API errors. Duck-typed
 * on `problemDetails` so the agent need not import the client's runtime.
 */
export function refusalOf(err: unknown): Refusal | undefined {
  const problem = (err as { problemDetails?: Record<string, unknown> } | null)?.problemDetails;
  const status = problem?.["status"];
  if (typeof status !== "number" || status < 400 || status >= 500) return undefined;
  if (status === 408 || status === 429) return undefined;
  const { detail, code, reason } = problem as Record<string, unknown>;
  return {
    status,
    detail: typeof detail === "string" && detail ? detail : `The request was refused (${status}).`,
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof reason === "string" ? { reason } : {}),
  };
}

/**
 * What a write says when the server never answered it (timeout, lost response,
 * 5xx: anything `refusalOf` doesn't call a refusal). It may have committed, so
 * it never says nothing changed; `read` names what shows the real state.
 */
export function saveUnsure(read: string): string {
  return `Couldn't confirm the change was saved. Check ${read} before trying again.`;
}

/**
 * For a write the api-client would replay (DELETE) and whose replay is refused once
 * the first attempt has committed. The refusal would read as "nothing changed", so
 * the tool takes the first attempt's answer and reports it as unknown.
 */
export const NO_REPLAY = { maxRetries: 0 } as const;

/**
 * Marks a write tool's result as "nothing was written": the tool returned before
 * any write request left, or the server answered a no-replay write with a refusal
 * that guarantees it changed nothing. `gateWriteTools` releases the confirmed
 * action's single use on this marker and on nothing else, and strips it before the
 * model sees the result. Set it only where that is provable: a timeout, a 5xx, a
 * network failure or any thrown error after a write was sent may have committed.
 */
export const NOT_EXECUTED = "notExecuted" as const;

export function notExecuted<T extends object>(result: T): T & { readonly notExecuted: true } {
  return { ...result, [NOT_EXECUTED]: true };
}

/**
 * A write's failure result, marked not-executed while no write is on its way.
 * `unsure` is set (by the tool) just before the first write request is sent.
 */
export function failedBeforeWrite<T extends object>(unsure: string | undefined, result: T) {
  return unsure === undefined ? notExecuted(result) : result;
}

export interface WriteFailureContext {
  /** What the tool was doing, as a verb phrase: "seat the party". */
  readonly action: string;
  /** `saveUnsure(..)`, set by the tool just before its first write request is sent. */
  readonly unsure: string | undefined;
  /** What an earlier step of a multi-write tool already saved: "The arrival". */
  readonly saved?: string;
}

/**
 * A refused or failed chat write, in words the model can pass on. Marked
 * not-executed iff `unsure` is undefined (no write was sent), and never says
 * "nothing changed" once one was, or once `saved` names an earlier write.
 */
export function writeFailure(err: unknown, ctx: WriteFailureContext) {
  return failedBeforeWrite(ctx.unsure, describeWriteFailure(err, ctx));
}

function describeWriteFailure(
  err: unknown,
  { action, unsure, saved }: WriteFailureContext
): { readonly error: string; readonly refused?: true } {
  const outcome = saved
    ? `${saved} was already saved; check the timeline before trying again.`
    : "Nothing was changed.";
  const refusal = refusalOf(err);
  if (!refusal) {
    if (unsure) return { error: saved ? `${saved} was already saved. ${unsure}` : unsure };
    return { error: `Couldn't ${action} right now. ${outcome} Ask the user to try again shortly.` };
  }
  if (refusal.status === 403) {
    return { refused: true, error: `The user doesn't have permission to do this. ${outcome}` };
  }
  return { refused: true, error: `${refusal.detail} ${outcome}` };
}

export interface NamedTable {
  readonly id: string;
  readonly name?: string | null;
  readonly tableNumber?: string | null;
}

/**
 * Resolve a staff reference ("12", "Patio 2") to one table. Tables may have a
 * number, a name, or both, so match in order of precision: number, exact
 * name, then case-insensitive name. More than one match at a step is an
 * error, never a guess: the user confirmed this reference, not a table id.
 */
export function resolveTable<T extends NamedTable>(
  tables: readonly T[],
  tableRef: string
): { table: T } | { error: string } {
  const ref = tableRef.trim();
  const steps: ReadonlyArray<(t: T) => boolean> = [
    (t) => t.tableNumber === ref,
    (t) => t.name === ref,
    (t) => t.name?.toLowerCase() === ref.toLowerCase(),
  ];
  for (const matches of steps) {
    const found = tables.filter(matches);
    if (found.length === 1) return { table: found[0]! };
    if (found.length > 1) {
      return { error: `Table ${tableRef} is ambiguous in this venue. Ask which table they mean.` };
    }
  }
  return { error: `Table ${tableRef} not found in this venue.` };
}
