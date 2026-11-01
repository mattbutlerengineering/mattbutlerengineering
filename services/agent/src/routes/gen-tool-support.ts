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
