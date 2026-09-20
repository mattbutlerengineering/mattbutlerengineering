import { describe, it, expect } from "vitest";
import {
  summarizeFailure,
  isFailureLine,
  failingPackages,
  normalizeLine,
  DEFAULT_TAIL_LINES,
} from "../summarize-task-failure.mjs";

/**
 * A faithful miniature of a real `turbo run test` transcript, taken from the
 * shape measured on 2026-09-20 while reproducing #5517 locally (cold cache,
 * turbo's default concurrency): ~50 packages streaming interleaved output,
 * the failing test named ~380 lines before the end, and turbo's own run
 * summary last.
 *
 * Reproduced faithfully because both properties that broke the first cut of
 * the summarizer are load-bearing: the SGR colour escapes vitest writes even
 * when redirected to a file, and turbo's TWO prefix spellings — `<pkg>:<task>:`
 * on streamed lines, `<pkg>#<task>` in the `Failed:` summary.
 */
const ESC = "\u001b";
const c = (code, text) => `${ESC}[${code}m${text}${ESC}[0m`;

const FAILING_DETAIL = [
  `@mbe/rialto-web:test:  ${c("31", "❯")} src/data/page-registry.test.ts ${c("2", "(58 tests | 1 failed)")} ${c("33", "30033ms")}`,
  `@mbe/rialto-web:test:      ${c("31", "×")} non-comingSoon entries resolve to an object with a default export ${c("33", "15124ms")}`,
  `@mbe/rialto-web:test: ${c("41", " FAIL ")} src/data/page-registry.test.ts > PageRegistry — load factories > non-comingSoon entries resolve to an object with a default export`,
  `@mbe/rialto-web:test: ${c("31", "Error")}: Test timed out in 15000ms.`,
  `@mbe/rialto-web:test:  ${c("36", "❯")} src/data/page-registry.test.ts:436:3`,
];

/** The noise that separates the failure detail from the transcript's tail. */
const PASSING_NOISE = Array.from(
  { length: 380 },
  (_, i) =>
    `@mbe/agent-core:test:  ${c("32", "✓")} src/thing-${i}.test.ts ${c("2", "(4 tests)")} 6ms`
);

const TAIL = [
  `@mbe/rialto-web:test:  ${c("2", " Test Files ")} ${c("31", "1 failed")} | ${c("32", "66 passed")} (67)`,
  `@mbe/rialto-web:test:  ${c("2", "      Tests ")} ${c("31", "1 failed")} | ${c("32", "768 passed")} (769)`,
  `@mattbutlerengineering/rialto:test:  ELIFECYCLE  Test failed. See above for more details.`,
  `@mbe/rialto-web#test:  ERROR  command (/home/runner/work/x/x/apps/rialto-web) pnpm run test exited (1)`,
  ``,
  ` Tasks:    46 successful, 50 total`,
  `Cached:    0 cached, 50 total`,
  `  Time:    9m29.219s `,
  `Failed:    @mbe/rialto-web#test`,
  ``,
  ` ERROR  run failed: command  exited (1)`,
];

const TRANSCRIPT = [...FAILING_DETAIL, ...PASSING_NOISE, ...TAIL].join("\n");

describe("normalizeLine", () => {
  it("strips SGR colour escapes", () => {
    expect(normalizeLine(`${ESC}[31m${ESC}[1mError${ESC}[22m: boom`)).toBe("Error: boom");
  });

  it("strips turbo's colon-form streamed prefix", () => {
    expect(normalizeLine("@mbe/rialto-web:test:  FAIL  src/a.test.ts")).toBe(
      " FAIL  src/a.test.ts"
    );
  });

  it("strips turbo's hash-form prefix", () => {
    expect(normalizeLine("@mbe/rialto-web#test:  ERROR  command exited (1)")).toBe(
      " ERROR  command exited (1)"
    );
  });

  it("leaves an unprefixed line alone", () => {
    expect(normalizeLine("Failed:    @mbe/rialto-web#test")).toBe(
      "Failed:    @mbe/rialto-web#test"
    );
  });
});

describe("isFailureLine", () => {
  it.each([
    [
      "a vitest FAIL header",
      `@mbe/rialto-web:test: ${c("41", " FAIL ")} src/a.test.ts > suite > name`,
    ],
    ["a failed-test bullet", `@mbe/rialto-web:test:      ${c("31", "×")} some test 15124ms`],
    [
      "a failed-file header",
      `@mbe/rialto-web:test:  ${c("31", "❯")} src/a.test.ts (58 tests | 1 failed)`,
    ],
    ["a timeout", "@mbe/rialto-web:test: Error: Test timed out in 15000ms."],
    ["a hook timeout", "@mbe/x:test: Error: Hook timed out in 30000ms."],
    [
      "failing counts",
      `@mbe/rialto-web:test:  ${c("2", " Test Files ")} 1 failed | 66 passed (67)`,
    ],
    ["turbo's verdict", "Failed:    @mbe/rialto-web#test"],
  ])("recognises %s", (_label, line) => {
    expect(isFailureLine(line)).toBe(true);
  });

  it.each([
    ["a passing file", `@mbe/agent-core:test:  ${c("32", "✓")} src/a.test.ts (4 tests) 6ms`],
    [
      "passing counts",
      `@mbe/agent-core:test:  ${c("2", " Test Files ")} ${c("32", "95 passed")} (95)`,
    ],
    ["turbo's task tally", " Tasks:    46 successful, 50 total"],
    ["a blank line", ""],
  ])("does not flag %s", (_label, line) => {
    expect(isFailureLine(line)).toBe(false);
  });
});

describe("failingPackages", () => {
  it("reads turbo's own verdict from both the summary and the streamed ERROR line", () => {
    expect([...failingPackages(TRANSCRIPT)]).toEqual(["@mbe/rialto-web"]);
  });

  it("returns an empty set when turbo blamed nobody", () => {
    expect(failingPackages(["all good", " Tasks:    50 successful, 50 total"]).size).toBe(0);
  });
});

describe("summarizeFailure", () => {
  const summary = summarizeFailure(TRANSCRIPT);
  const text = summary.join("\n");

  // The whole point of the module, stated as an assertion: the failing test's
  // name must survive, and the `tail -10` it replaces must be shown not to
  // carry it. Without the second half this test would pass against a
  // summarizer that simply returned the tail.
  it("names the failing test, where tail -10 does not", () => {
    const testName = "non-comingSoon entries resolve to an object with a default export";
    const tail = TRANSCRIPT.split("\n").slice(-DEFAULT_TAIL_LINES).join("\n");

    expect(tail).not.toContain(testName);
    expect(text).toContain(testName);
  });

  it("names the file and the line the failure came from", () => {
    expect(text).toContain("src/data/page-registry.test.ts");
    expect(text).toContain("src/data/page-registry.test.ts:436:3");
  });

  it("keeps the reason", () => {
    expect(text).toContain("Test timed out in 15000ms.");
  });

  it("keeps turbo's verdict and the failing counts", () => {
    expect(text).toContain("Failed:    @mbe/rialto-web#test");
    expect(text).toContain("Test Files  1 failed | 66 passed (67)");
  });

  it("strips colour escapes from what it emits", () => {
    expect(text).not.toContain(ESC);
  });

  it("keeps turbo's package prefix, which is what says WHICH package failed", () => {
    expect(text).toContain("@mbe/rialto-web:test:");
  });

  it("drops the 380 passing lines between the failure and the tail", () => {
    expect(text).not.toContain("@mbe/agent-core:test:");
  });

  // A passing test that asserts on malformed input legitimately prints an
  // error name to stderr. Quoting it under "what failed" names an innocent
  // package — the same misleading-report defect this module removes.
  it("ignores an error printed by a package turbo did not blame", () => {
    const withNoise = [
      `@mbe/scripts:test: SyntaxError: Unexpected token 'o', "not json" is not valid JSON`,
      ...TRANSCRIPT.split("\n"),
    ].join("\n");

    expect(summarizeFailure(withNoise).join("\n")).not.toContain("@mbe/scripts:test:");
  });

  it("falls back to the tail when no marker matches, never returning nothing", () => {
    const opaque = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const result = summarizeFailure(opaque);

    expect(result).toHaveLength(DEFAULT_TAIL_LINES);
    expect(result.at(-1)).toBe("line 39");
  });

  it("caps a flood of failures instead of pasting hundreds of lines into an issue", () => {
    const flood = [
      ...Array.from({ length: 500 }, (_, i) => `@mbe/x:test:      × failing test ${i} 1ms`),
      "Failed:    @mbe/x#test",
    ].join("\n");
    const result = summarizeFailure(flood, { maxLines: 40 });

    expect(result.length).toBeLessThanOrEqual(41); // 40 + the elision marker
    expect(result.join("\n")).toContain("more failure lines omitted");
    // The tail is kept, so turbo's verdict survives the cap.
    expect(result.at(-1)).toBe("Failed:    @mbe/x#test");
  });

  it("returns the tail for an empty capture rather than throwing", () => {
    expect(() => summarizeFailure("")).not.toThrow();
    expect(summarizeFailure("")).toEqual([]);
  });
});
