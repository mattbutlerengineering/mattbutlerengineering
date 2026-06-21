/**
 * Query-parameter validation seam.
 *
 * Each function is pure, takes raw string input (or undefined) from HTTP query
 * params, and returns a consistent `{ valid, value?, error? }` shape.
 *
 * Date format rule: YYYY-MM-DD only (ISO 8601 date-only, no time component).
 * This is the canonical format used across all reservation and availability
 * endpoints. Datetime strings (with 'T') are explicitly rejected here so that
 * callers pass only the date portion.
 *
 * Security note: the date regex is anchored (^ and $) and has fixed-length
 * quantifiers only — no backtracking, no ReDoS risk.
 */

/** Matches exactly YYYY-MM-DD and nothing else. Anchored; no ReDoS risk. */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidResult<T> {
  valid: true;
  value: T;
  error?: never;
}

export interface InvalidResult {
  valid: false;
  value?: never;
  error: string;
}

export type ValidationResult<T> = ValidResult<T> | InvalidResult;

/**
 * Validates a YYYY-MM-DD date string.
 * Returns `{ valid: true, value: Date }` on success (Date is UTC midnight).
 * Returns `{ valid: false, error }` for wrong format or impossible calendar dates.
 */
export function validateDateString(value: string | undefined): ValidationResult<Date> {
  if (!value) {
    return { valid: false, error: "Date is required. Use YYYY-MM-DD format." };
  }
  if (!DATE_REGEX.test(value)) {
    return { valid: false, error: `Invalid date format. Use YYYY-MM-DD. Received: ${value}` };
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (isNaN(d.getTime())) {
    return { valid: false, error: `Invalid calendar date: ${value}` };
  }
  // Verify the parsed date round-trips — catches impossible dates like 2024-13-01
  const reparsed = d.toISOString().slice(0, 10);
  if (reparsed !== value) {
    return { valid: false, error: `Invalid calendar date: ${value}` };
  }
  return { valid: true, value: d };
}

/**
 * Validates a party size from a query string value.
 * Must be a positive integer (no decimals, no Infinity, >= 1).
 */
export function validatePartySize(value: string | undefined): ValidationResult<number> {
  if (!value) {
    return { valid: false, error: "partySize is required. Must be a positive integer." };
  }
  // Reject decimals and Infinity before parseInt
  if (value.includes(".") || value === "Infinity" || value === "-Infinity") {
    return { valid: false, error: "Invalid party size. Must be a positive integer." };
  }
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    return { valid: false, error: "Invalid party size. Must be a positive integer." };
  }
  return { valid: true, value: n };
}

/**
 * Validates and normalises pagination query params.
 * Always returns `valid: true` — invalid inputs fall back to safe defaults.
 * page: min 1, default 1.
 * limit: min 1, max 100, default 20.
 */
export function validatePagination(
  page?: string,
  limit?: string
): { valid: true; page: number; limit: number; error?: never } {
  const rawPage = parseInt(page ?? "1", 10);
  const rawLimit = parseInt(limit ?? "20", 10);
  const safePage = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
  const safeLimit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit));
  return { valid: true, page: safePage, limit: safeLimit };
}

/**
 * Validates a date range given YYYY-MM-DD strings for start and end.
 * Optionally enforces a maxDays window.
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  maxDays?: number
): { valid: boolean; error?: string } {
  const startResult = validateDateString(startDate);
  if (!startResult.valid) {
    return { valid: false, error: `Invalid startDate: ${startResult.error}` };
  }
  const endResult = validateDateString(endDate);
  if (!endResult.valid) {
    return { valid: false, error: `Invalid endDate: ${endResult.error}` };
  }
  if (startResult.value > endResult.value) {
    return { valid: false, error: "startDate must be before or equal to endDate." };
  }
  if (maxDays !== undefined) {
    const diffMs = endResult.value.getTime() - startResult.value.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > maxDays) {
      return {
        valid: false,
        error: `Date range cannot exceed ${maxDays} days. Received ${Math.ceil(diffDays)} days.`,
      };
    }
  }
  return { valid: true };
}

/**
 * Validates that a value belongs to a fixed set of allowed string literals.
 * Returns the narrowed typed value on success.
 */
export function validateEnum<T extends string>(
  value: string | undefined,
  allowed: ReadonlyArray<T>
): ValidationResult<T> {
  if (!value) {
    return {
      valid: false,
      error: `Value is required. Allowed: ${allowed.join(", ")}`,
    };
  }
  if ((allowed as ReadonlyArray<string>).includes(value)) {
    return { valid: true, value: value as T };
  }
  return {
    valid: false,
    error: `Invalid value "${value}". Allowed: ${allowed.join(", ")}`,
  };
}
