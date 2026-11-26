/**
 * What a write-scoped personal access token may send (#9778): it may only move
 * a booking and pause or resume tables. Each check is an allowlist, so a field
 * nobody named here is refused.
 */

type Body = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** True when `value` is an object whose keys are all in `allowed`. */
const onlyKeys = (value: unknown, allowed: ReadonlySet<string>): value is Body =>
  isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key));

/** A token may only move a booking: date, time, table, party size. */
const MOVE_BOOKING_FIELDS = new Set(["date", "startTime", "endTime", "tableId", "partySize"]);

/** An absent body sends no field. */
export const isBookingMove = (body: unknown): boolean =>
  body === undefined || body === null || onlyKeys(body, MOVE_BOOKING_FIELDS);

/** Exactly the rule `pause_tables` sends: named tables, whole service days, no extras. */
const TABLE_PAUSE_RULE_FIELDS = new Set([
  "id",
  "kind",
  "targetKind",
  "tableIds",
  "startsOn",
  "endsOn",
  "window",
]);

const isTablePauseRule = (rule: unknown): boolean =>
  onlyKeys(rule, TABLE_PAUSE_RULE_FIELDS) &&
  rule.kind === "closure" &&
  rule.targetKind === "tables" &&
  Array.isArray(rule.tableIds) &&
  rule.tableIds.length > 0 &&
  (rule.window === undefined || rule.window === null);

const PAUSE_BODY_FIELDS = new Set(["expectedVersion", "rule", "decisions"]);

/** `POST …/closures`: a table pause, with no decision on any booking. */
export const isTablePauseSave = (body: unknown): boolean =>
  onlyKeys(body, PAUSE_BODY_FIELDS) &&
  isTablePauseRule(body.rule) &&
  (body.decisions === undefined || (Array.isArray(body.decisions) && body.decisions.length === 0));

const RESUME_BODY_FIELDS = new Set(["tellCancelledGuests", "seen"]);

/**
 * `DELETE …/closures/:ruleId`: the whole rule, telling no guest (a table pause
 * saves only when no booking sits on its tables). The stored rule's own shape
 * is checked by the route, which can read it in the venue's context.
 */
export const isTablePauseResume = (body: unknown): boolean =>
  onlyKeys(body, RESUME_BODY_FIELDS) && body.tellCancelledGuests === false;
