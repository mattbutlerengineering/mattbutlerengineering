import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * Display dates, times, numbers and money go through `utils/format.ts` (via
 * `useVenueFormat`). Computation-only `Intl` use is allowlisted with its reason.
 */
const ALLOWED = new Map<string, string>([
  ["utils/format.ts", "the formatting module itself"],
  ["utils/ics.ts", "formatToParts('en-US') for iCalendar computation"],
  ["utils/service-day.ts", "en-CA date-key computation"],
  ["utils/venue-wall-time.ts", "zone-offset computation for wall-clock to instant"],
  ["i18n/locales.ts", "Intl.Locale parsing, not display"],
  ["components/venue-onboarding/LocationTimeStep.tsx", "resolvedOptions() zone detection"],
]);

const DISPLAY_INTL = /toLocale\w*String\(|Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("display formatting", () => {
  it("has no ad-hoc Intl / toLocale* call outside utils/format.ts", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => DISPLAY_INTL.test(readFileSync(join(SRC, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
