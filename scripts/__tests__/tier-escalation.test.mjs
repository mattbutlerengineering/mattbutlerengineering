import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countReviewSurfaceAdditions,
  decideSizeEscalation,
  decideKeywordEscalation,
  EXCLUDED_FROM_SIZE,
  formatReplayTable,
  replayRow,
  runReplay,
} from "../tier-escalation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const f = (path, additions) => ({ path, additions });

describe("countReviewSurfaceAdditions / decideSizeEscalation", () => {
  // #6610's real shape (Owner decision 2026-10-18): the 16 non-code lines are
  // in services/reservations/CLAUDE.md, which stays counted -> 1004 -> T4.
  it("#6610: 988 code + 16 CLAUDE.md lines = 1004 counted, generated excluded -> escalates", () => {
    const files = [
      f("llms-full.txt", 600),
      f("apps/hospitality/llms.txt", 300),
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
      f("llms-full.txt", 600),
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
    const row = replayRow(pr({ files: [f("llms.txt", 1200), f("a.ts", 10)] }));
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

describe("docs/change-tiers.md agrees with the module", () => {
  it("names every excluded-from-size pattern", () => {
    const doc = readFileSync(resolve(ROOT, "docs/change-tiers.md"), "utf8");
    for (const pattern of EXCLUDED_FROM_SIZE) expect(doc).toContain("`" + pattern + "`");
  });
});
