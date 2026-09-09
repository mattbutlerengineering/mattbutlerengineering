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

import { describe, it, expect } from "vitest";

import {
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
