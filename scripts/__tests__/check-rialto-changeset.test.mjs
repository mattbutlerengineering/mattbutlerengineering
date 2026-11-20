/**
 * Guard for the TapeChart-overlaps gap (docs/backlog.md, maintenance:
 * e2e-behind-edge-csp): commit e4c30808 shipped a public `classifyOverlap`
 * prop, an `overlap` field on every positioned bar, and a row-height
 * behavior change in `packages/rialto` with no `.changeset/` entry — found
 * by hand while writing an unrelated ship record, which is not a detection
 * mechanism.
 *
 * The check: a diff that touches rialto's *published* source
 * (`packages/rialto/src/**`, minus tests, stories, showcase, and markdown)
 * must also add or modify a `.changeset/*.md` that either names
 * `@mattbutlerengineering/rialto` or is an explicit empty changeset
 * (`pnpm changeset --empty` — the visible, self-cleaning "no release
 * needed" declaration; `changeset version` deletes it, so the escape hatch
 * cannot accumulate into a silent allowlist).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BLOCKED_EXIT_CODES,
  classifyBaseFailure,
  RIALTO_PACKAGE,
  isRialtoReleaseSource,
  parseChangesetPackages,
  changesetCoversRialto,
  evaluateRialtoChangesetGate,
} from "../check-rialto-changeset.mjs";

const RIALTO_CHANGESET = {
  path: ".changeset/tapechart-overlap-lanes.md",
  content: `---\n"${RIALTO_PACKAGE}": minor\n---\n\nTapeChart renders overlaps as per-row lanes.\n`,
};

const EMPTY_CHANGESET = {
  path: ".changeset/calm-doors-wave.md",
  content: "---\n---\n\nInternal refactor only; no consumer-visible change.\n",
};

const OTHER_PACKAGE_CHANGESET = {
  path: ".changeset/odd-bees-run.md",
  content: '---\n"@mbe/api-client": patch\n---\n\nUnrelated package.\n',
};

describe("isRialtoReleaseSource", () => {
  it.each([
    "packages/rialto/src/components/TapeChart/TapeChart.tsx",
    "packages/rialto/src/components/TapeChart/TapeChart.module.css",
    "packages/rialto/src/components/TapeChart/types.ts",
    "packages/rialto/src/components/index.ts",
    "packages/rialto/src/hooks/useBoop.ts",
    "packages/rialto/src/tokens/colors.css",
  ])("counts published source: %s", (path) => {
    expect(isRialtoReleaseSource(path)).toBe(true);
  });

  it.each([
    // Tests never ship.
    "packages/rialto/src/components/TapeChart/TapeChart.test.tsx",
    "packages/rialto/src/components/Select/Select.spec.ts",
    "packages/rialto/src/components/__tests__/helpers.ts",
    "packages/rialto/src/test/accessibility/axe.test.tsx",
    "packages/rialto/src/test/setup.ts",
    // Stories feed the showcase, not the published dist (files: dist/lib only).
    "packages/rialto/src/components/TapeChart/TapeChart.stories.tsx",
    // showcase/ is demo-only: unreachable from lib-entry.ts.
    "packages/rialto/src/showcase/DemoPage.tsx",
    // Prose.
    "packages/rialto/src/components/README.md",
    // Outside src/ or outside rialto entirely.
    "packages/rialto/package.json",
    "packages/rialto/vite.config.lib.ts",
    "apps/rialto-web/src/pages/data/TapeChartPage.tsx",
    "scripts/check-rialto-changeset.mjs",
  ])("ignores non-published path: %s", (path) => {
    expect(isRialtoReleaseSource(path)).toBe(false);
  });
});

describe("parseChangesetPackages", () => {
  it("extracts the package names from frontmatter", () => {
    expect(parseChangesetPackages(RIALTO_CHANGESET.content)).toEqual([RIALTO_PACKAGE]);
  });

  it("returns an empty array for an explicit empty changeset", () => {
    expect(parseChangesetPackages(EMPTY_CHANGESET.content)).toEqual([]);
  });

  it("handles unquoted package keys", () => {
    expect(parseChangesetPackages("---\nsome-pkg: patch\n---\n")).toEqual(["some-pkg"]);
  });

  it("returns null when there is no frontmatter at all", () => {
    expect(parseChangesetPackages("# Changesets\n\nREADME prose, not a changeset.\n")).toBe(null);
  });
});

describe("changesetCoversRialto", () => {
  it("is covered by a changeset naming rialto", () => {
    expect(changesetCoversRialto(RIALTO_CHANGESET.content)).toBe(true);
  });

  it("is covered by an explicit empty changeset (the escape hatch)", () => {
    expect(changesetCoversRialto(EMPTY_CHANGESET.content)).toBe(true);
  });

  it("is NOT covered by a changeset naming only another package", () => {
    expect(changesetCoversRialto(OTHER_PACKAGE_CHANGESET.content)).toBe(false);
  });

  it("is NOT covered by a malformed file with no frontmatter", () => {
    expect(changesetCoversRialto("no frontmatter here")).toBe(false);
  });
});

describe("evaluateRialtoChangesetGate", () => {
  // RED fixture: exactly the e4c30808 shape — published rialto source
  // changed, zero changesets in the diff.
  it("rejects a rialto source change with no changeset", () => {
    const { findings } = evaluateRialtoChangesetGate({
      changedFiles: [
        "packages/rialto/src/components/TapeChart/TapeChart.tsx",
        "packages/rialto/src/components/TapeChart/types.ts",
        "packages/rialto/src/components/TapeChart/TapeChart.test.tsx",
      ],
      changesets: [],
    });
    expect(findings).toEqual([
      "packages/rialto/src/components/TapeChart/TapeChart.tsx",
      "packages/rialto/src/components/TapeChart/types.ts",
    ]);
  });

  it("passes a rialto source change accompanied by a rialto changeset", () => {
    const { findings } = evaluateRialtoChangesetGate({
      changedFiles: ["packages/rialto/src/components/TapeChart/TapeChart.tsx"],
      changesets: [RIALTO_CHANGESET],
    });
    expect(findings).toEqual([]);
  });

  it("passes a rialto source change accompanied by an explicit empty changeset", () => {
    const { findings } = evaluateRialtoChangesetGate({
      changedFiles: ["packages/rialto/src/hooks/useBoop.ts"],
      changesets: [EMPTY_CHANGESET],
    });
    expect(findings).toEqual([]);
  });

  it("rejects when the only changeset in the diff names a different package", () => {
    const { findings } = evaluateRialtoChangesetGate({
      changedFiles: ["packages/rialto/src/components/index.ts"],
      changesets: [OTHER_PACKAGE_CHANGESET],
    });
    expect(findings).toEqual(["packages/rialto/src/components/index.ts"]);
  });

  it("passes a non-rialto change regardless of changesets", () => {
    const { findings } = evaluateRialtoChangesetGate({
      changedFiles: ["services/users/src/routes/health.ts", "docs/backlog.md"],
      changesets: [],
    });
    expect(findings).toEqual([]);
  });

  it("passes a test/story-only rialto change with no changeset", () => {
    const { findings } = evaluateRialtoChangesetGate({
      changedFiles: [
        "packages/rialto/src/components/TapeChart/TapeChart.test.tsx",
        "packages/rialto/src/components/TapeChart/TapeChart.stories.tsx",
        "packages/rialto/src/test/accessibility/axe.test.tsx",
      ],
      changesets: [],
    });
    expect(findings).toEqual([]);
  });

  it("passes an empty diff", () => {
    const { findings } = evaluateRialtoChangesetGate({ changedFiles: [], changesets: [] });
    expect(findings).toEqual([]);
  });
});

// ── Base-resolution failures (#9203) ─────────────────────────────────────
// Cloud sessions clone shallow, so `git merge-base HEAD origin/main` cannot
// resolve. The gate must still fail closed (never skip), but say WHY, and
// exit with a distinct code so `pnpm repo-audit` can label it BLOCKED.
describe("classifyBaseFailure", () => {
  it("names a shallow clone and the unshallow remedy", () => {
    const failure = classifyBaseFailure({
      isShallow: true,
      hasOriginMain: true,
      baseResolved: false,
      overrideSet: false,
    });
    expect(failure.kind).toBe("shallow");
    expect(failure.exitCode).toBe(BLOCKED_EXIT_CODES.shallow);
    expect(failure.exitCode).not.toBe(0);
    expect(failure.message).toContain("shallow clone");
    expect(failure.message).toContain("git fetch --unshallow --filter=blob:none origin main");
    expect(failure.message).toContain("RIALTO_CHANGESET_BASE");
  });

  it("names a missing origin/main in a full-history clone", () => {
    const failure = classifyBaseFailure({
      isShallow: false,
      hasOriginMain: false,
      baseResolved: false,
      overrideSet: false,
    });
    expect(failure.kind).toBe("origin-main-missing");
    expect(failure.exitCode).toBe(BLOCKED_EXIT_CODES["origin-main-missing"]);
    expect(failure.message).toContain("origin/main is missing");
    expect(failure.message).toContain("git fetch origin main");
  });

  it("names an unreadable diff when a base did resolve", () => {
    const failure = classifyBaseFailure({
      isShallow: true,
      hasOriginMain: true,
      baseResolved: true,
      overrideSet: false,
    });
    expect(failure.kind).toBe("diff-unreadable");
    expect(failure.exitCode).toBe(BLOCKED_EXIT_CODES["diff-unreadable"]);
    expect(failure.message).toContain("could not be read");
  });

  it("reports a bad RIALTO_CHANGESET_BASE override as a plain failure, not a clone problem", () => {
    const failure = classifyBaseFailure({
      isShallow: true,
      hasOriginMain: true,
      baseResolved: false,
      overrideSet: true,
    });
    expect(failure.kind).toBe("override-unresolvable");
    expect(failure.exitCode).toBe(1);
  });

  it("keeps a generic non-zero failure when full history still has no merge base", () => {
    const failure = classifyBaseFailure({
      isShallow: false,
      hasOriginMain: true,
      baseResolved: false,
      overrideSet: false,
    });
    expect(failure.kind).toBe("no-merge-base");
    expect(failure.exitCode).toBe(1);
  });

  it("gives every blocked kind a distinct non-zero exit code", () => {
    const codes = Object.values(BLOCKED_EXIT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code > 1)).toBe(true);
  });
});

describe("check-rialto-changeset CLI in a real shallow clone", () => {
  const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "check-rialto-changeset.mjs");
  const run = (cwd, args, env = {}) =>
    spawnSync(args[0], args.slice(1), {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    });
  const gitIn = (cwd, ...args) => {
    const result = run(cwd, ["git", ...args]);
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const identity = ["-c", "user.name=t", "-c", "user.email=t@example.com"];

  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "rialto-cs-"));
    const source = join(dir, "source");
    gitIn(dir, "init", "-q", "-b", "main", source);
    for (const n of [1, 2, 3]) {
      gitIn(source, ...identity, "commit", "-q", "--allow-empty", "-m", `c${n}`);
    }
    gitIn(dir, "clone", "-q", "--depth", "1", `file://${source}`, join(dir, "clone"));
    // Reproduce the cloud shape: HEAD unrelated to the shallow origin/main.
    gitIn(join(dir, "clone"), "checkout", "-q", "--orphan", "work");
    gitIn(join(dir, "clone"), ...identity, "commit", "-q", "--allow-empty", "-m", "work");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("is genuinely shallow with an origin/main that does not share history", () => {
    const clone = join(dir, "clone");
    expect(gitIn(clone, "rev-parse", "--is-shallow-repository")).toBe("true");
    expect(run(clone, ["git", "merge-base", "HEAD", "origin/main"]).status).not.toBe(0);
  });

  it("exits with the shallow code and the shallow message, not a bare failure", () => {
    const result = run(join(dir, "clone"), ["node", SCRIPT]);
    expect(result.status).toBe(BLOCKED_EXIT_CODES.shallow);
    expect(result.stdout).toContain("BLOCKED: rialto changeset check (shallow clone)");
    expect(result.stdout).toContain("git fetch --unshallow --filter=blob:none origin main");
    expect(result.stdout).not.toMatch(/^PASS/m);
  });

  it("still honours RIALTO_CHANGESET_BASE in the shallow clone", () => {
    const result = run(join(dir, "clone"), ["node", SCRIPT], { RIALTO_CHANGESET_BASE: "HEAD" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("reports a missing origin/main in a clone with no remote", () => {
    const lone = join(dir, "lone");
    gitIn(dir, "init", "-q", "-b", "main", lone);
    gitIn(lone, ...identity, "commit", "-q", "--allow-empty", "-m", "only");
    const result = run(lone, ["node", SCRIPT]);
    expect(result.status).toBe(BLOCKED_EXIT_CODES["origin-main-missing"]);
    expect(result.stdout).toContain("BLOCKED: rialto changeset check (origin/main missing)");
  });
});
