import {
  SERVICE_PRESETS,
  applyPreset,
  autoLastSeating,
  effectiveDays,
  emptyService,
  minutesOf,
  toClock,
  toMinutes,
  type QuickSetupDraft,
  type ServiceDraft,
  type ServicePresetId,
} from "./quick-setup-draft.js";
import { validateDraft } from "./quick-setup-validate.js";

/**
 * Where a service goes in the week: the preset placement and the "move it" fix for an overlap
 * (ux.md F2). "Clear" is decided by the same validation the form shows, never by a second rule set.
 */

const MINUTES_PER_DAY = 1440;
const START_STEP_MINUTES = 15;

/** Minutes from a service's opening to its close; a close not after the opening is the next day's. */
function lengthOf(opens: string, closes: string): number {
  const length = toMinutes(closes) - toMinutes(opens);
  return length > 0 ? length : length + MINUTES_PER_DAY;
}

/**
 * True when the draft with `candidate` in place has no overlap and no too-long day among the
 * services that share its days. Services still missing times are left out, and every name is
 * made non-empty, so only the hours speak.
 */
function isClear(draft: QuickSetupDraft, candidate: ServiceDraft): boolean {
  const days = effectiveDays(draft, candidate);
  const sharing = draft.services.filter(
    (s) =>
      s.id !== candidate.id &&
      minutesOf(s) !== null &&
      effectiveDays(draft, s).some((d) => days.includes(d))
  );
  const named = (s: ServiceDraft): ServiceDraft => ({ ...s, name: "service" });
  const issues = validateDraft({
    ...draft,
    services: [...sharing.map(named), named(candidate)],
  });
  return !issues.some((i) => i.code === "overlap" || i.code === "span_too_long");
}

/**
 * A name chip placed in the draft: the preset's name and times when they clear every other
 * service on its days. Otherwise its length, starting when the other services close, so Late
 * follows Dinner instead of overlapping it; if that is not clear either (or would start after
 * midnight, which a time of day cannot hold) the preset's own times stay and the overlap is shown.
 */
export function placePreset(
  draft: QuickSetupDraft,
  serviceId: string,
  preset: ServicePresetId,
  name: string
): ServiceDraft {
  const service = draft.services.find((s) => s.id === serviceId) ?? emptyService(serviceId);
  const defaults = applyPreset(service, preset, name);
  if (isClear(draft, defaults)) return defaults;
  const days = effectiveDays(draft, service);
  const closes = draft.services
    .filter((s) => s.id !== serviceId)
    .flatMap((s) => {
      const minutes = minutesOf(s);
      return minutes !== null && effectiveDays(draft, s).some((d) => days.includes(d))
        ? [minutes.closesAt]
        : [];
    });
  if (closes.length === 0) return defaults;
  const start = Math.max(...closes);
  if (start >= MINUTES_PER_DAY) return defaults;
  const own = SERVICE_PRESETS[preset];
  const end = start + lengthOf(own.opens, own.closes);
  const placed = {
    ...defaults,
    opens: toClock(start),
    closes: toClock(end),
    lastSeating: autoLastSeating(toClock(end), toClock(start)),
  };
  return isClear(draft, placed) ? placed : defaults;
}

/** The service starting at `opensAt` (minutes) with its length kept; a typed last seating shifts with it. */
export function moveServiceStart(service: ServiceDraft, opensAt: number): ServiceDraft {
  if (service.opens === null || service.closes === null) return service;
  const closes = toClock(opensAt + lengthOf(service.opens, service.closes));
  const opens = toClock(opensAt);
  const shift = opensAt - toMinutes(service.opens);
  const lastSeating = service.lastSeatingLinked
    ? autoLastSeating(closes, opens)
    : service.lastSeating === null
      ? null
      : toClock(toMinutes(service.lastSeating) + shift);
  return { ...service, opens, closes, lastSeating };
}

/**
 * The earliest start at or after the service's own, in 15-minute steps within the day, that
 * keeps its length and leaves the draft free of overlap and too-long days; `null` when none.
 */
export function firstClearStart(draft: QuickSetupDraft, serviceId: string): number | null {
  const service = draft.services.find((s) => s.id === serviceId);
  if (!service || service.opens === null || service.closes === null) return null;
  for (let from = toMinutes(service.opens); from < MINUTES_PER_DAY; from += START_STEP_MINUTES) {
    if (isClear(draft, moveServiceStart(service, from))) return from;
  }
  return null;
}
