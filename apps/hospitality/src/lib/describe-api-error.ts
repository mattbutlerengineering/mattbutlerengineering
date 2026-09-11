import type { ErrorCategory } from "@mbe/api-client";

/**
 * One voice for bad news (architecture § "One voice for bad news"; ux.md § Copy).
 *
 * Turns anything thrown at a Host — an `ApiClientError`, the `TypeError` fetch throws when the
 * network is gone, the `DOMException` an aborted or timed-out request leaves behind, or nothing
 * recognisable — into the house sentence for its category, plus what the surface may offer next.
 * The raw message survives only as `raw`, for the "Show details" block; it is never the sentence.
 *
 * Mirrors `describe-auth-error.ts`, which owns the sign-in voice.
 */

export type ApiErrorCategory = ErrorCategory | "network" | "timeout";

/** The control a surface offers for this category (ux.md § Copy, "Retry?" column). */
export type ErrorRecovery = "retry" | "edit" | "sign-in" | "refresh" | "none";

export interface ApiErrorDescription {
  readonly category: ApiErrorCategory;
  /** The sentence shown to a person — never a request line, never `undefined`, never a bare code. */
  readonly detail: string;
  readonly retryable: boolean;
  readonly recovery: ErrorRecovery;
  /** The original message (`error.message`, or `String(error)`), for the details block only. */
  readonly raw: string;
}

type CopyRow = Pick<ApiErrorDescription, "detail" | "retryable" | "recovery">;

const RETRY: Pick<CopyRow, "retryable" | "recovery"> = { retryable: true, recovery: "retry" };
const EDIT: Pick<CopyRow, "retryable" | "recovery"> = { retryable: false, recovery: "edit" };

/** ux.md § Copy, verbatim. Keyed by category; `badRequest` shares the validation row. */
export const ERROR_COPY: Readonly<Record<ApiErrorCategory, CopyRow>> = {
  network: {
    detail: "Can't reach the reservations service. Check the venue's connection, then try again.",
    ...RETRY,
  },
  timeout: {
    detail: "That took too long. The service didn't answer in time — try again.",
    ...RETRY,
  },
  serverError: {
    detail: "The reservations service hit a snag — nothing was changed. Try again in a moment.",
    ...RETRY,
  },
  rateLimited: {
    detail: "Too many requests at once. Give it a few seconds, then try again.",
    ...RETRY,
  },
  conflict: {
    detail: "Someone got there first — that table or time was just taken. Pick another.",
    ...EDIT,
  },
  validationError: {
    detail: "Something in the form didn't pass. Check party size, time and table.",
    ...EDIT,
  },
  badRequest: {
    detail: "Something in the form didn't pass. Check party size, time and table.",
    ...EDIT,
  },
  unauthorized: {
    detail: "Your session ended. Sign in again to keep working.",
    retryable: false,
    recovery: "sign-in",
  },
  forbidden: {
    detail: "That's above your role. Ask a manager to make this change.",
    retryable: false,
    recovery: "none",
  },
  notFound: {
    detail: "That reservation's gone — it may have been cancelled or moved. Refreshing the grid.",
    retryable: false,
    recovery: "refresh",
  },
  unknown: {
    detail: "That didn't go through. Try again — if it keeps happening, tell your manager.",
    ...RETRY,
  },
};

/** Categories whose `problemDetails.detail` is written for the person filling the form. */
const SHOWS_PROBLEM_DETAIL: ReadonlySet<ApiErrorCategory> = new Set([
  "conflict",
  "validationError",
  "badRequest",
]);

const API_CATEGORIES: ReadonlySet<string> = new Set<ErrorCategory>([
  "badRequest",
  "unauthorized",
  "forbidden",
  "notFound",
  "conflict",
  "validationError",
  "rateLimited",
  "serverError",
  "unknown",
]);

interface ApiClientErrorLike {
  readonly category: ErrorCategory;
  readonly problemDetails: { readonly detail?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structural check rather than `instanceof ApiClientError`: consumers' tests routinely mock
 * `@mbe/api-client`, and a mocked class makes `instanceof` throw — this must never throw.
 */
function isApiClientError(error: unknown): error is ApiClientErrorLike {
  return (
    isRecord(error) &&
    typeof error.category === "string" &&
    API_CATEGORIES.has(error.category) &&
    isRecord(error.problemDetails)
  );
}

function isTimeout(error: unknown): boolean {
  return isRecord(error) && (error.name === "TimeoutError" || error.name === "AbortError");
}

function rawMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

/** A `problemDetails.detail` worth showing: non-blank, not a bare status code, not "undefined". */
function humanProblemDetail(problemDetails: ApiClientErrorLike["problemDetails"]): string | null {
  const detail = typeof problemDetails.detail === "string" ? problemDetails.detail.trim() : "";
  if (detail === "" || detail === "undefined" || /^\d{3}$/.test(detail)) return null;
  return detail;
}

function describe(category: ApiErrorCategory, raw: string, detail?: string): ApiErrorDescription {
  const row = ERROR_COPY[category];
  return { category, ...row, detail: detail ?? row.detail, raw };
}

export function describeApiError(error: unknown): ApiErrorDescription {
  const raw = rawMessage(error);

  if (isApiClientError(error)) {
    const shown = SHOWS_PROBLEM_DETAIL.has(error.category)
      ? humanProblemDetail(error.problemDetails)
      : null;
    return describe(error.category, raw, shown ?? undefined);
  }
  if (isTimeout(error)) return describe("timeout", raw);
  if (error instanceof TypeError) return describe("network", raw);
  return describe("unknown", raw);
}
