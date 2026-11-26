import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fitness guard for the one availability commit path (#9684, part of #9314).
 *
 * Every availability change is committed by `commitSave` in
 * `services/availability-commit.ts`: it bumps `Venue.availabilityVersion`
 * (compare-and-set) and writes the `AvailabilityChange` audit row in one
 * transaction. A second site that increments the version or writes an audit
 * row bypasses the lock, the stale-draft check or the inverse, so it fails the
 * ordinary `test` job here. A stale exemption fails too.
 */
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const COMMIT_PATH = "services/availability-commit.ts";

const VERSION_BUMP_RE = /availabilityVersion\s*:\s*\{\s*increment\b/g;
const AUDIT_WRITE_RE = /\bavailabilityChange\s*\.\s*(?:create|createMany|upsert)\s*\(/g;

const SITES = [
  { kind: "version bump", re: VERSION_BUMP_RE },
  { kind: "audit row write", re: AUDIT_WRITE_RE },
] as const;

interface Exemption {
  /** Path relative to `src/`. */
  file: string;
  kind: (typeof SITES)[number]["kind"];
  reason: string;
}

const EXEMPTIONS: Exemption[] = [
  {
    file: "scripts/collapse-day-named-schedules.ts",
    kind: "version bump",
    reason:
      "one-shot operator script: bumps the version so an open draft or an old Undo gets a 409, and writes no audit row on purpose",
  },
];

/** Replaces comments with spaces (offsets and newlines preserved). */
function blankComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/** The kind of each commit-path site in `source`, one entry per occurrence. */
function commitSites(source: string): string[] {
  const code = blankComments(source);
  return SITES.flatMap(({ kind, re }) => [...code.matchAll(re)].map(() => kind));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

describe("commitSites", () => {
  it("flags a direct version increment", () => {
    expect(
      commitSites(`await tx.venue.update({ data: { availabilityVersion: { increment: 1 } } });`)
    ).toEqual(["version bump"]);
  });

  it("flags an audit row write", () => {
    expect(commitSites(`await tx.availabilityChange.create({ data });`)).toEqual([
      "audit row write",
    ]);
  });

  it("ignores a compare-and-set read and mentions in comments", () => {
    expect(
      commitSites(
        `where: { id, availabilityVersion: expected }\n// availabilityVersion: { increment: 1 }\n/* tx.availabilityChange.create( */`
      )
    ).toEqual([]);
  });
});

describe("availability commit path", () => {
  const found = sourceFiles(srcDir).flatMap((path) => {
    const file = relative(srcDir, path).split("\\").join("/");
    return commitSites(readFileSync(path, "utf8")).map((kind) => ({ file, kind }));
  });
  const outside = found.filter((s) => s.file !== COMMIT_PATH);
  const exempt = (s: { file: string; kind: string }) =>
    EXEMPTIONS.some((e) => e.file === s.file && e.kind === s.kind);

  it("finds commitSave's own sites, so the scan cannot pass by reading nothing", () => {
    const own = found.filter((s) => s.file === COMMIT_PATH).map((s) => s.kind);
    expect(own.filter((k) => k === "audit row write")).toHaveLength(1);
    expect(own.filter((k) => k === "version bump")).toHaveLength(2);
  });

  it("commits a version bump or an audit row only in commitSave or an exempt file", () => {
    expect(outside.filter((s) => !exempt(s))).toEqual([]);
  });

  it("has no stale exemptions", () => {
    const stale = EXEMPTIONS.filter(
      (e) => !outside.some((s) => s.file === e.file && s.kind === e.kind)
    );
    expect(stale).toEqual([]);
  });
});
