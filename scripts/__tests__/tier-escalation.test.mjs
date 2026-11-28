import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPaths,
  countReviewSurfaceAdditions,
  decideSizeEscalation,
  decideKeywordEscalation,
  EXCLUDED_FROM_SIZE,
  formatReplayTable,
  replayRow,
  runReplay,
} from "../tier-escalation.mjs";
import { isAutoMergeEligible } from "../merge-queue-eligibility.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const f = (path, additions) => ({ path, additions });

describe("countReviewSurfaceAdditions / decideSizeEscalation", () => {
  // #6610's real shape (Owner decision 2026-10-18): the 16 non-code lines are
  // in services/reservations/CLAUDE.md, which stays counted -> 1004 -> T4.
  it("#6610: 988 code + 16 CLAUDE.md lines = 1004 counted, generated excluded -> escalates", () => {
    const files = [
      f("packages/rialto/registry.json", 600),
      f("apps/hospitality/generated-x.json", 300),
      f("packages/rialto-catalog/src/generated-schemas.ts", 294),
      f("services/reservations/CLAUDE.md", 16),
      f("services/a/src/routes/r.ts", 988),
    ];
    expect(countReviewSurfaceAdditions(files)).toBe(1004);
    const v = decideSizeEscalation({ files, highestTier: 3 });
    expect(v.escalate).toBe(true);
    expect(v.counted).toBe(1004);
  });

  it("generated churn and run-artifact md alone do not push 988 code lines over", () => {
    const files = [
      f("packages/rialto/registry.json", 600),
      f("packages/rialto-catalog/src/generated-schemas.ts", 294),
      f("docs/features/x/prd.md", 16),
      f("services/a/src/routes/r.ts", 988),
    ];
    expect(countReviewSurfaceAdditions(files)).toBe(988);
    expect(decideSizeEscalation({ files, highestTier: 3 }).escalate).toBe(false);
  });

  it("#6591: real code plus root docs still escalates", () => {
    const files = [f("services/a/src/x.ts", 1387), f("docs/guide.md", 943)];
    const v = decideSizeEscalation({ files, highestTier: 3 });
    expect(v.counted).toBe(2330);
    expect(v.escalate).toBe(true);
  });

  it("does not escalate past T4", () => {
    expect(decideSizeEscalation({ files: [f("a.ts", 5000)], highestTier: 4 }).escalate).toBe(false);
  });

  it("missing/NaN additions count 0; root-level md counts; docs/features md does not", () => {
    expect(countReviewSurfaceAdditions([f("a.ts", undefined), f("b.ts", NaN), f("c.ts", 5)])).toBe(
      5
    );
    expect(countReviewSurfaceAdditions([f("README.md", 7), f("docs/features/a/b.md", 9)])).toBe(7);
  });

  it("excludes lockfile, registry, dep graph", () => {
    const files = [
      f("pnpm-lock.yaml", 2000),
      f("packages/x/registry.json", 10),
      f("infrastructure/worker/dep-graph.json", 10),
      f("docs/architecture/dependency-graph.md", 10),
    ];
    expect(countReviewSurfaceAdditions(files)).toBe(0);
  });
});

describe("decideKeywordEscalation", () => {
  const prose = (s) => ({ title: "chore: x", bodyProse: s, pathTier: 2 });

  it("#6541: descriptive credential mention does not escalate", () => {
    const v = decideKeywordEscalation(
      prose(
        "Needs a human to supply `E2E_AUTH0_*` credentials or CI/artifact access to run the suite."
      )
    );
    expect(v.action).toBe("none");
    expect(decideKeywordEscalation(prose("Needs the E2E credentials or CI access.")).action).toBe(
      "none"
    );
  });

  it("a real incident sentence still bumps", () => {
    expect(
      decideKeywordEscalation(prose("We leaked the Stripe key and must rotate it.")).action
    ).toBe("bump");
  });

  it("keyword in the title alone bumps", () => {
    expect(
      decideKeywordEscalation({ title: "fix: rotate leaked key", bodyProse: "", pathTier: 2 })
        .action
    ).toBe("bump");
  });

  it("keyword plus sensitive path hard-sets T4, even for descriptive prose", () => {
    expect(
      decideKeywordEscalation({ title: "x", bodyProse: "Adds credentials docs.", pathTier: 3 })
        .action
    ).toBe("hardset-T4");
  });

  it("hyphenated identifiers and code spans never count (#5956)", () => {
    expect(decideKeywordEscalation(prose("Runs check-deploy-secret-provisioning.")).action).toBe(
      "none"
    );
    expect(
      decideKeywordEscalation({ title: "t", bodyProse: "Prints the `secret` value.", pathTier: 3 })
        .action
    ).toBe("none");
  });

  it("tolerates undefined inputs", () => {
    expect(decideKeywordEscalation({ pathTier: 0 }).action).toBe("none");
  });
});

describe("replay", () => {
  const pr = (over) => ({
    number: 1,
    title: "t",
    body: "",
    label: "tier:critical",
    files: [],
    ...over,
  });

  it("reports a PR whose size verdict changes", () => {
    const row = replayRow(pr({ files: [f("pnpm-lock.yaml", 1200), f("a.ts", 10)] }));
    expect(row.changed).toBe(true);
    expect(formatReplayTable([row])).toMatch(/#1 .*escalates -> -/);
  });

  it("prints an explicit 0 changed line", () => {
    expect(formatReplayTable([replayRow(pr())])).toMatch(/^0 changed of 1 PRs replayed/);
  });

  it("fails loud (non-zero, message) when the API is unavailable", () => {
    let errText = "";
    let outText = "";
    const code = runReplay(["--limit", "5"], {
      run: () => {
        throw new Error("no credential");
      },
      out: (s) => (outText += s),
      err: (s) => (errText += s),
    });
    expect(code).not.toBe(0);
    expect(errText).toMatch(/replay failed/);
    expect(outText).toBe("");
  });
});

// #9125: the daily acmm-regression PR also rewrites metrics.json; unmatched, it
// defaulted to T2 (tier:standard) and auto-merge was never enabled.
describe("classifyPaths: acmm-regression PR (#9125)", () => {
  it("the acmm-regression file set classifies T1", () => {
    expect(
      classifyPaths([
        ".claude/acmm/state.json",
        "apps/marketing/public/acmm-report.json",
        "apps/marketing/public/metrics.json",
        "README.md",
      ]).tier
    ).toBe(1);
  });

  it("metrics.json beside unrelated source stays above T1", () => {
    expect(
      classifyPaths(["apps/marketing/public/metrics.json", "packages/types/src/a.ts"]).tier
    ).toBeGreaterThanOrEqual(2);
  });
});

// #10174: agent-instruction files graded T1 let an unreviewed merge path land edits
// to the review rules themselves. Hold list authority: docs/routines/fix-protocol.md § 3.
describe("classifyPaths: agent-instruction files are above T1 (#10174)", () => {
  const GUARDRAIL_PATHS = [
    "CLAUDE.md",
    "AGENTS.md",
    ".claude/rules/gotchas.md",
    ".claude/settings.json",
    ".claude/hooks/pre-push-typecheck.sh",
    ".claude/skills/local-ci-precheck/SKILL.md",
    ".claude/implement-queue.md",
    "docs/routines/fix-protocol.md",
    "docs/routines/mbe-weekly-improve.md",
    "docs/claude-reference.md",
    "docs/agents-reference.md",
  ];

  it.each(GUARDRAIL_PATHS)("%s classifies T3, never T1", (path) => {
    expect(classifyPaths([path]).tier).toBe(3);
  });

  it("a guardrail path beside a markdown file takes the higher tier", () => {
    expect(classifyPaths(["README.md", "CLAUDE.md"]).tier).toBe(3);
  });

  it("keeps ordinary markdown at T1 (the markdown default is unchanged)", () => {
    expect(classifyPaths(["docs/notes.md", "README.md"]).tier).toBe(1);
  });

  it("keeps the automation-only ACMM state file at T1 (#9125)", () => {
    expect(classifyPaths([".claude/acmm/state.json"]).tier).toBe(1);
  });

  it.each(GUARDRAIL_PATHS)(
    "a %s PR with has-pr and no needs-review is not auto-mergeable",
    (path) => {
      const { tier } = classifyPaths([path]);
      const tierLabel = {
        1: "tier:trivial",
        2: "tier:standard",
        3: "tier:sensitive",
        4: "tier:critical",
      }[tier];
      expect(isAutoMergeEligible(["has-pr", tierLabel]).eligible).toBe(false);
    }
  );
});

describe("docs/change-tiers.md agrees with the module", () => {
  it("names every excluded-from-size pattern", () => {
    const doc = readFileSync(resolve(ROOT, "docs/change-tiers.md"), "utf8");
    for (const pattern of EXCLUDED_FROM_SIZE) expect(doc).toContain("`" + pattern + "`");
  });
});

// #8398: the unmatched-path T2 default used to fire only when NO file matched,
// so a T1-matching file (a generated file, .md) beside real source downgraded the PR.
describe("classifyPaths: per-file unmatched default (#8398)", () => {
  it("markdown + unmatched code -> T2", () => {
    const { tier, reasons } = classifyPaths(["docs/notes.md", "tools/unknown/thing.rs"]);
    expect(tier).toBe(2);
    expect(reasons.join(" ")).toMatch(/unmatched paths default to T2: tools\/unknown\/thing\.rs/);
  });

  it("markdown-only -> T1", () => {
    expect(classifyPaths(["docs/notes.md", "README.md"]).tier).toBe(1);
  });

  it("a matched higher rule wins over T1 and unmatched files", () => {
    expect(classifyPaths(["docs/notes.md", "tools/x.rs", "services/a/src/routes/r.ts"]).tier).toBe(
      3
    );
    expect(classifyPaths(["a.md", "prisma/schema.prisma"]).tier).toBe(4);
  });

  it("#8378's real file list is T2+, not T1", () => {
    const { tier } = classifyPaths([
      "packages/rialto/registry.json",
      "packages/sentry/src/react.test.ts",
      "packages/sentry/src/react.ts",
      "scripts/__tests__/sentry-heartbeat-browser.test.mjs",
      "scripts/sentry-heartbeat.mjs",
    ]);
    expect(tier).toBeGreaterThanOrEqual(2);
  });

  it("package source and scripts are classified by rule, not the unmatched default", () => {
    for (const p of ["packages/types/src/a.ts", "scripts/foo.mjs"]) {
      const { tier, reasons } = classifyPaths([p]);
      expect(tier).toBe(2);
      expect(reasons.join(" ")).not.toMatch(/unmatched/);
    }
  });

  it("test-only and generated-only PRs stay T1", () => {
    expect(
      classifyPaths(["packages/types/src/a.test.ts", "infrastructure/worker/dep-graph.json"]).tier
    ).toBe(1);
    // .test.mjs is not in the T1 test-only rule; it stays at its existing T2.
    expect(classifyPaths(["scripts/__tests__/a.test.mjs"]).tier).toBe(2);
  });

  it("escapes displayed paths via the show callback and caps unmatched list", () => {
    const { reasons } = classifyPaths(["a\nb.rs", "c.rs", "d.rs", "e.rs"], (p) =>
      p.replace(/\n/g, "\\n")
    );
    expect(reasons[0]).toBe("unmatched paths default to T2: a\\nb.rs, c.rs, d.rs…");
  });
});

// #9063: PR #9057 deleted the generated infrastructure/pulumi/llms-full.txt and
// was labelled tier:critical for it. A deleted generated artifact adds no
// reviewable code; a deleted real file (or any ADDED/CHANGED file) still counts.
describe("classifyPaths: deleted generated files (#9063)", () => {
  const cases = [
    {
      name: "deleted generated file under pulumi is ignored",
      files: ["infrastructure/pulumi/registry.json", "docs/notes.md"],
      deleted: ["infrastructure/pulumi/registry.json"],
      tier: 1,
    },
    {
      name: "the same file modified (not deleted) still escalates to T4",
      files: ["infrastructure/pulumi/registry.json", "docs/notes.md"],
      deleted: [],
      tier: 4,
    },
    {
      name: "a deleted real pulumi source file still escalates to T4",
      files: ["infrastructure/pulumi/index.ts"],
      deleted: ["infrastructure/pulumi/index.ts"],
      tier: 4,
    },
    {
      name: "only deleted generated files -> T1, not the empty-diff T2 default",
      files: ["infrastructure/pulumi/generated-types.ts"],
      deleted: ["infrastructure/pulumi/generated-types.ts"],
      tier: 1,
    },
    {
      name: "a deleted generated file never lowers other files",
      files: ["infrastructure/pulumi/registry.json", "services/a/src/routes/r.ts"],
      deleted: ["infrastructure/pulumi/registry.json"],
      tier: 3,
    },
    {
      name: "an unrelated deleted-set entry is harmless",
      files: ["prisma/schema.prisma"],
      deleted: ["something/else.ts"],
      tier: 4,
    },
  ];
  it.each(cases)("$name", ({ files, deleted, tier }) => {
    expect(classifyPaths(files, (p) => p, { deleted: new Set(deleted) }).tier).toBe(tier);
  });

  it("no deleted option keeps the old behaviour", () => {
    expect(classifyPaths(["infrastructure/pulumi/registry.json"]).tier).toBe(4);
  });
});

describe("generated-file list no longer names llms.txt (#9057)", () => {
  it("EXCLUDED_FROM_SIZE has no llms entries", () => {
    expect(EXCLUDED_FROM_SIZE.filter((p) => p.includes("llms"))).toEqual([]);
  });
});
