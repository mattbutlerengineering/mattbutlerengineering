import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const APP = dirname(SRC);

/**
 * "Today" in hospitality is the device calendar day (`utils/service-day.ts` `deviceDate`; the E2E
 * twin is `e2e/local-day.ts` `localDay`), and every comparison it feeds is against a local
 * `en-CA` string. `@mbe/types` `toDateString` and a bare `toISOString().slice(0, 10)` answer the
 * UTC day, which rolls to tomorrow at 16:00/17:00 Pacific and empties the timeline for the whole
 * evening service (docs/backlog.md, "UTC-vs-local date class"). Zone-free calendar arithmetic on a
 * `YYYY-MM-DD` already in hand (`new Date(\`${d}T00:00:00Z\`)` + `setUTCDate`) is fine and is not
 * matched here: only a UTC day taken from the *current instant* is.
 */
const UTC_TODAY: ReadonlyArray<readonly [RegExp, string]> = [
  [/toDateString\(\s*new Date\(\s*\)\s*\)/, "toDateString(new Date())"],
  [/toDateString\(\s*new Date\(\s*Date\.now\(/, "toDateString(new Date(Date.now()…))"],
  [/toDateString\(\s*Date\.now\(/, "toDateString(Date.now()…)"],
  [
    /new Date\(\s*(Date\.now\(\)[^)]*)?\)\.toISOString\(\)\.(slice|substring)\(\s*0\s*,\s*10\s*\)/,
    "new Date().toISOString().slice(0, 10)",
  ],
  [
    /new Date\(\s*\)\.toISOString\(\)\.split\(\s*["']T["']\s*\)/,
    'new Date().toISOString().split("T")',
  ],
  [/new Date\(\s*\)\.toISOString\(\)\.replace\(\s*\/T/, "new Date().toISOString().replace(/T…/)"],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Playwright specs are the E2E "source": they build the fixtures the app filters on today. */
function e2eFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === ".auth" ? [] : e2eFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

function offenders(files: string[]): string[] {
  return files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return UTC_TODAY.filter(([pattern]) => pattern.test(text)).map(
      ([, label]) => `${relative(APP, file)}: ${label}`
    );
  });
}

describe("no UTC 'today' in hospitality", () => {
  it("app source never takes today's date from a UTC slice or toDateString(now)", () => {
    expect(offenders(sourceFiles(SRC))).toEqual([]);
  });

  it("E2E specs and mocks never re-date fixtures with the UTC day", () => {
    expect(offenders(e2eFiles(join(APP, "e2e")))).toEqual([]);
  });
});
