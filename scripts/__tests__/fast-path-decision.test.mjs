import { describe, test, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_SPECIALIST_REVIEWERS,
  decideFastPath,
  main,
  parseArgs,
} from "../fast-path-decision.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TRUSTED = {
  trusted: true,
  state: "fresh",
  reason: "dist is newer than or equal to every src file",
};
const STALE = { trusted: false, state: "stale", reason: "src newer than dist" };

/** Fake classifier: gate = docs/adr/**, low-risk = *.test.ts only, one specialist for migrations. */
const classifier = {
  matchesGatePath: (f) => f.startsWith("docs/adr/"),
  reviewersForDiff: (files) =>
    files.some((f) => f.includes("migrations/")) ? ["migration-reviewer"] : [],
  qualifiesForLowRiskFastPath: (files) =>
    files.every((f) => f.endsWith(".test.ts")) && !files.some((f) => f.startsWith("docs/adr/")),
};

const decide = (over) =>
  decideFastPath({ files: ["a.test.ts"], labels: [], freshness: TRUSTED, classifier, ...over });

describe("decideFastPath precedence", () => {
  test("untrusted freshness fails closed with every specialist, naming the state", () => {
    const d = decide({ freshness: STALE });
    expect(d.fastPath).toBe(false);
    expect(d.reviewers).toEqual([...ALL_SPECIALIST_REVIEWERS]);
    expect(d.reason).toContain("stale");
  });

  test("unloadable classifier (null) fails closed with every specialist", () => {
    const d = decide({ classifier: null });
    expect(d).toMatchObject({ fastPath: false, holdForHuman: false });
    expect(d.reviewers).toEqual([...ALL_SPECIALIST_REVIEWERS]);
    expect(d.reason).toMatch(/could not be loaded/);
  });

  test("freshness failure outranks a gate path and the needs-review label", () => {
    const d = decide({ freshness: STALE, files: ["docs/adr/x.md"], labels: ["needs-review"] });
    expect(d.reviewers).toEqual([...ALL_SPECIALIST_REVIEWERS]);
    expect(d.reason).toContain("stale");
  });

  test("empty file list fails closed", () => {
    const d = decide({ files: [] });
    expect(d).toMatchObject({ fastPath: false, holdForHuman: false, reviewers: [] });
    expect(d.reason).toMatch(/no changed files/);
  });

  test("a gate path holds for a human, with reviewers still computed", () => {
    const d = decide({ files: ["docs/adr/x.md", "db/migrations/1.sql"] });
    expect(d).toMatchObject({
      fastPath: false,
      holdForHuman: true,
      reviewers: ["migration-reviewer"],
    });
    expect(d.reason).toMatch(/gate path/);
  });

  test("a gate path outranks the needs-review label", () => {
    const d = decide({ files: ["docs/adr/x.md"], labels: ["needs-review"] });
    expect(d.holdForHuman).toBe(true);
    expect(d.reason).toMatch(/gate path/);
  });

  test("needs-review label blocks the fast path but still computes reviewers", () => {
    const d = decide({ files: ["db/migrations/1.sql"], labels: ["needs-review"] });
    expect(d).toMatchObject({
      fastPath: false,
      holdForHuman: false,
      reviewers: ["migration-reviewer"],
    });
    expect(d.reason).toMatch(/needs-review/);
  });

  test("clean low-risk diff takes the fast path with no reviewers", () => {
    expect(decide()).toMatchObject({ fastPath: true, holdForHuman: false, reviewers: [] });
  });

  test("not low-risk and no specialist: no fast path, no reviewers, distinct reason", () => {
    const d = decide({ files: ["src/app.ts"] });
    expect(d).toMatchObject({ fastPath: false, holdForHuman: false, reviewers: [] });
    expect(d.reason).toMatch(/not low-risk/);
  });

  test("specialist match disqualifies the fast path and lists the reviewers", () => {
    const d = decide({ files: ["db/migrations/1.sql"] });
    expect(d).toMatchObject({ fastPath: false, reviewers: ["migration-reviewer"] });
  });

  test("never mutates its inputs", () => {
    const files = Object.freeze(["a.test.ts"]);
    const labels = Object.freeze(["x"]);
    expect(() => decide({ files, labels })).not.toThrow();
  });
});

describe("ALL_SPECIALIST_REVIEWERS single-source pin", () => {
  const src = readFileSync(resolve(ROOT, "packages/agent-core/src/pr-risk-classifier.ts"), "utf8");
  const block = src.slice(
    src.indexOf("const DIFF_REVIEWERS"),
    src.indexOf("export function reviewersForDiff")
  );
  const registered = [...block.matchAll(/^\s+name: "([^"]+)"/gm)].map((m) => m[1]);

  test("equals the names registered in DIFF_REVIEWERS, in order", () => {
    expect(registered.length).toBeGreaterThan(0);
    expect([...ALL_SPECIALIST_REVIEWERS]).toEqual(registered);
  });

  test("every name has a .claude/agents file", () => {
    for (const name of ALL_SPECIALIST_REVIEWERS) {
      expect(existsSync(resolve(ROOT, `.claude/agents/${name}.md`)), name).toBe(true);
    }
  });
});

describe("parseArgs", () => {
  test("check --pr N", () => {
    expect(parseArgs(["check", "--pr", "12"])).toEqual({ pr: "12" });
  });
  test("check --files a,b", () => {
    expect(parseArgs(["check", "--files", "a, b,,"])).toEqual({ files: ["a", "b"] });
  });
  test.each([
    [[]],
    [["decide", "--pr", "1"]],
    [["check"]],
    [["check", "--pr"]],
    [["check", "--pr", "abc"]],
    [["check", "--pr", "1", "--files", "a"]],
    [["check", "--files"]],
    [["check", "--files", ","]],
    [["check", "--bogus"]],
  ])("usage error for %j", (argv) => {
    expect(parseArgs(argv)).toHaveProperty("usage");
  });
});

describe("main", () => {
  const baseDeps = (over = {}) => {
    const out = [];
    const err = [];
    return {
      out,
      err,
      deps: {
        getFiles: vi.fn(() => ["a.test.ts"]),
        getLabels: vi.fn(() => []),
        getFreshness: vi.fn(() => TRUSTED),
        loadClassifier: vi.fn(async () => classifier),
        out: (s) => out.push(s),
        err: (s) => err.push(s),
        ...over,
      },
    };
  };

  test("--pr prints one JSON line and exits 0", async () => {
    const { deps, out } = baseDeps();
    expect(await main(["check", "--pr", "7"], deps)).toBe(0);
    expect(deps.getFiles).toHaveBeenCalledWith("7");
    expect(deps.getLabels).toHaveBeenCalledWith("7");
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toMatchObject({ fastPath: true, reviewers: [] });
  });

  test("--files skips gh entirely", async () => {
    const { deps, out } = baseDeps();
    expect(await main(["check", "--files", "docs/adr/x.md"], deps)).toBe(0);
    expect(deps.getFiles).not.toHaveBeenCalled();
    expect(deps.getLabels).not.toHaveBeenCalled();
    expect(JSON.parse(out[0])).toMatchObject({ holdForHuman: true });
  });

  test("a fail-closed decision still exits 0", async () => {
    const { deps, out } = baseDeps({ loadClassifier: vi.fn(async () => null) });
    expect(await main(["check", "--files", "a.ts"], deps)).toBe(0);
    expect(JSON.parse(out[0]).reviewers).toEqual([...ALL_SPECIALIST_REVIEWERS]);
  });

  test("usage error exits 2 with usage on stderr and nothing on stdout", async () => {
    const { deps, out, err } = baseDeps();
    expect(await main(["check"], deps)).toBe(2);
    expect(out).toEqual([]);
    expect(err.join("")).toMatch(/Usage/);
  });

  test("a gh failure is not a decision: exit 1, message on stderr, no stdout", async () => {
    const { deps, out, err } = baseDeps({
      getFiles: vi.fn(() => {
        throw new Error("gh: not found");
      }),
    });
    expect(await main(["check", "--pr", "7"], deps)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join("")).toContain("gh: not found");
  });
});
