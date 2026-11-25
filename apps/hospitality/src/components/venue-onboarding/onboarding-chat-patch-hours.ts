import type { QuickSetupDraft, ServiceDraft } from "../availability/quick-setup-draft.js";
import {
  WEEK_DISPLAY_ORDER,
  effectiveDays,
  emptyService,
  replaceService,
  setServiceDays,
  setServiceTime,
  setSharedDays,
} from "../availability/quick-setup-draft.js";
import { addDays } from "@mbe/availability";
import { issueMessage, validateDraft } from "../availability/quick-setup-validate.js";
import { localeRuntime } from "../../i18n/runtime.js";
import { formatCalendarDate } from "../../utils/format.js";

/**
 * The hours patch (#9475): the quick-setup card's first service, as strings. The card's own
 * `validateDraft` (the wizard's legacy-reader rules) is the gate, so the chat refuses exactly
 * what the card would flag. A draft that is merely unfinished (a lone opening time) is not an
 * error: the owner's next message, or the form, completes it.
 */

export const HOURS_FIELDS = ["serviceName", "opens", "closes", "lastSeating", "days"] as const;

/** Stored weekday indexes, 0 = Sunday, named the way the server's patch schema names them. */
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Issues that only say "not filled in yet". Everything else is a real problem with the hours. */
const UNFINISHED = new Set([
  "name_required",
  "time_required",
  "days_required",
  "block_days_required",
]);

const FIRST_SERVICE_ID = "onboarding-service-1";

function firstService(draft: QuickSetupDraft): ServiceDraft {
  return draft.services[0] ?? emptyService(FIRST_SERVICE_ID);
}

/** The first service as the flat strings the patch and the server's `draft` use. */
export function hoursDraftOf(draft: QuickSetupDraft): Record<string, string> {
  const service = firstService(draft);
  const running = effectiveDays(draft, service);
  return {
    serviceName: service.name,
    opens: service.opens ?? "",
    closes: service.closes ?? "",
    lastSeating: service.lastSeating ?? "",
    days: WEEK_DISPLAY_ORDER.filter((day) => running.includes(day))
      .map((day) => DAY_NAMES[day])
      .join(","),
  };
}

/** "mon,tue" as stored weekday indexes; `null` when any name is unknown. */
export function parseDays(value: string): number[] | null {
  const names = value.split(",");
  const indexes = names.map((name) => DAY_NAMES.indexOf(name as (typeof DAY_NAMES)[number]));
  return indexes.includes(-1) || names.length === 0 ? null : indexes;
}

type Errors = Partial<Record<string, string>>;

/** Shape errors for the fields themselves, before the draft is built. */
function fieldErrors(fields: Record<string, string>): Errors {
  const t = localeRuntime.i18n.t;
  const errors: Errors = {};
  for (const key of ["opens", "closes", "lastSeating"] as const) {
    const value = fields[key];
    if (value !== undefined && !CLOCK.test(value)) {
      errors[key] = t("onboarding.chat.notOffered.time", { value });
    }
  }
  const days = fields.days;
  if (days !== undefined && parseDays(days) === null) {
    errors.days = t("onboarding.chat.notOffered.days", { value: days });
  }
  const name = fields.serviceName;
  if (name !== undefined && name.trim() === "") {
    errors.serviceName = t("onboarding.chat.notOffered.serviceName");
  }
  return errors;
}

function build(current: QuickSetupDraft, fields: Record<string, string>): QuickSetupDraft {
  let service = firstService(current);
  if (fields.serviceName !== undefined) service = { ...service, name: fields.serviceName.trim() };
  // Opens and closes first: a linked last seating follows them. An explicit one then wins.
  if (fields.opens !== undefined) service = setServiceTime(service, "opens", fields.opens);
  if (fields.closes !== undefined) service = setServiceTime(service, "closes", fields.closes);
  if (fields.lastSeating !== undefined) {
    service = setServiceTime(service, "lastSeating", fields.lastSeating);
  }
  const days = fields.days === undefined ? null : parseDays(fields.days);
  if (days === null) return replaceOrAdd(current, service);
  const shared = [...new Set(days)];
  return setSharedDays(replaceOrAdd(current, setServiceDays(service, null, shared)), shared);
}

function replaceOrAdd(draft: QuickSetupDraft, service: ServiceDraft): QuickSetupDraft {
  return draft.services.length === 0
    ? { ...draft, services: [service] }
    : replaceService(draft, service);
}

const SAMPLE_MONDAY = "2026-10-26";

/** A stored weekday index (0 = Sunday) as its name in `locale`. */
export function weekdayLabel(
  weekday: number,
  locale: string,
  style: "long" | "short" = "long"
): string {
  const date = addDays(SAMPLE_MONDAY, WEEK_DISPLAY_ORDER.indexOf(weekday));
  return formatCalendarDate(date, { weekday: style }, locale);
}

function weekdayName(weekday: number): string {
  return weekdayLabel(weekday, localeRuntime.i18n.language);
}

export type HoursPatchResult = { ok: true; draft: QuickSetupDraft } | { ok: false; errors: Errors };

export function applyHoursPatch(
  current: QuickSetupDraft,
  fields: Record<string, string>
): HoursPatchResult {
  const shape = fieldErrors(fields);
  if (Object.keys(shape).length > 0) return { ok: false, errors: shape };

  const draft = build(current, fields);
  const t = localeRuntime.i18n.t;
  const errors: Errors = {};
  for (const issue of validateDraft(draft, { legacyReader: true })) {
    if (UNFINISHED.has(issue.code) || issue.field === "days") continue;
    const key = issue.field === "name" ? "serviceName" : issue.field;
    errors[key] ??= issueMessage(issue, draft, t, weekdayName);
  }
  return Object.keys(errors).length === 0 ? { ok: true, draft } : { ok: false, errors };
}
