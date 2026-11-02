import type { ErrorCategory } from "@mbe/api-client";
import type { TFunction } from "i18next";
import enUS from "../i18n/catalogs/en-US.json";
import { defaultT } from "../i18n/default-t.js";

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

const COPY_BEHAVIOUR: Readonly<Record<ApiErrorCategory, Omit<CopyRow, "detail">>> = {
  network: RETRY,
  timeout: RETRY,
  // Never "nothing was changed" in serverError copy: a 5xx from a gateway can follow a write that committed.
  serverError: RETRY,
  rateLimited: RETRY,
  conflict: EDIT,
  validationError: EDIT,
  badRequest: EDIT,
  unauthorized: { retryable: false, recovery: "sign-in" },
  forbidden: { retryable: false, recovery: "none" },
  notFound: { retryable: false, recovery: "refresh" },
  unknown: RETRY,
};

/**
 * ux.md § Copy, verbatim, in en-US. The sentences live in the `apiError` catalog block (en-US,
 * es-MX, fr-CA); this export is the en-US source for tests and snapshots. `describeApiError`
 * resolves the sentence at call time in the active language.
 */
export const ERROR_COPY: Readonly<Record<ApiErrorCategory, CopyRow>> = Object.fromEntries(
  (Object.keys(COPY_BEHAVIOUR) as ApiErrorCategory[]).map((category) => [
    category,
    { detail: enUS.apiError[category], ...COPY_BEHAVIOUR[category] },
  ])
) as Record<ApiErrorCategory, CopyRow>;

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

function describe(
  category: ApiErrorCategory,
  raw: string,
  t: TFunction,
  detail?: string
): ApiErrorDescription {
  return {
    category,
    ...COPY_BEHAVIOUR[category],
    detail: detail ?? t(`apiError.${category}`),
    raw,
  };
}

/**
 * `t` defaults to the dashboard runtime's. Guest surfaces (booking widget, waitlist join) run
 * their own i18next instance, so they pass theirs — otherwise the sentence follows the staff
 * language instead of the one the guest picked.
 */
export function describeApiError(error: unknown, t: TFunction = defaultT): ApiErrorDescription {
  const raw = rawMessage(error);

  if (isApiClientError(error)) {
    const shown = SHOWS_PROBLEM_DETAIL.has(error.category)
      ? humanProblemDetail(error.problemDetails)
      : null;
    return describe(error.category, raw, t, shown ?? undefined);
  }
  if (isTimeout(error)) return describe("timeout", raw, t);
  if (error instanceof TypeError) return describe("network", raw, t);
  return describe("unknown", raw, t);
}
