import { describe, it, expect, vi } from "vitest";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import {
  buildBrokenMainCreateArgs,
  buildBrokenMainTitle,
  buildBrokenMainBody,
  extractCulpritSha,
  buildRecoveryComment,
  selectIssuesToClose,
  runAutoCloseWatchdog,
} from "../revert-watchdog.mjs";

const SHA = "abc1234def5678901234567890123456789abcd";
const OTHER_SHA = "def5678901234567890123456789abcd1234abc";

// ---------------------------------------------------------------------------
// buildBrokenMainTitle / buildBrokenMainBody — unchanged issue format (#2958)
// ---------------------------------------------------------------------------

describe("buildBrokenMainTitle", () => {
  it("matches the original watchdog title format", () => {
    expect(buildBrokenMainTitle(SHA)).toBe(`🚨 CRITICAL: Broken Main at commit ${SHA}`);
  });
});

describe("buildBrokenMainBody", () => {
  it("includes the culprit sha and PR number", () => {
    const body = buildBrokenMainBody(SHA, "42");
    expect(body).toContain(SHA);
    expect(body).toContain("#42");
  });
});

// ---------------------------------------------------------------------------
// buildBrokenMainCreateArgs — label vocabulary fix (#2958)
// ---------------------------------------------------------------------------

describe("buildBrokenMainCreateArgs", () => {
  it("carries ci-fix, ready, and priority:critical labels", () => {
    const args = buildBrokenMainCreateArgs("title", "body");

    expect(args).toEqual([
      "--title",
      "title",
      "--body",
      "body",
      "--label",
      "ci-fix",
      "--label",
      COORDINATION_LABELS.READY,
      "--label",
      "priority:critical",
    ]);
  });

  it("uses the shared ready label constant instead of a re-typed literal", () => {
    const args = buildBrokenMainCreateArgs("title", "body");
    const readyIdx = args.indexOf(COORDINATION_LABELS.READY);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(args[readyIdx - 1]).toBe("--label");
  });
});

// ---------------------------------------------------------------------------
// extractCulpritSha — pure parsing of the watchdog issue title
// ---------------------------------------------------------------------------

describe("extractCulpritSha", () => {
  it("extracts the sha from a well-formed watchdog title", () => {
    expect(extractCulpritSha({ title: buildBrokenMainTitle(SHA) })).toBe(SHA);
  });

  it("returns null for a title that does not match the watchdog format", () => {
    expect(extractCulpritSha({ title: "some unrelated issue" })).toBeNull();
  });

  it("returns null for a missing title", () => {
    expect(extractCulpritSha({})).toBeNull();
    expect(extractCulpritSha(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRecoveryComment
// ---------------------------------------------------------------------------

describe("buildRecoveryComment", () => {
  it("mentions the recovering green sha", () => {
    expect(buildRecoveryComment(SHA)).toContain(SHA);
  });
});

// ---------------------------------------------------------------------------
// selectIssuesToClose — pure close-decision logic
// ---------------------------------------------------------------------------

describe("selectIssuesToClose", () => {
  it("selects an issue whose culprit sha is a known ancestor", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const closed = selectIssuesToClose(issues, { [SHA]: true });
    expect(closed.map((i) => i.number)).toEqual([1]);
  });

  it("excludes an issue whose culprit sha is not an ancestor", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const closed = selectIssuesToClose(issues, { [SHA]: false });
    expect(closed).toEqual([]);
  });

  it("excludes an issue with no ancestry data yet", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    expect(selectIssuesToClose(issues, {})).toEqual([]);
  });

  it("excludes issues whose title does not carry a culprit sha", () => {
    const issues = [{ number: 1, title: "unrelated issue" }];
    expect(selectIssuesToClose(issues, { [SHA]: true })).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const snapshot = JSON.stringify(issues);
    selectIssuesToClose(issues, { [SHA]: true });
    expect(JSON.stringify(issues)).toBe(snapshot);
  });

  it("returns [] for empty or nullish input", () => {
    expect(selectIssuesToClose([], {})).toEqual([]);
    expect(selectIssuesToClose(null, {})).toEqual([]);
    expect(selectIssuesToClose(undefined, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runAutoCloseWatchdog — side-effecting orchestration with injected git/gh ops
// ---------------------------------------------------------------------------

describe("runAutoCloseWatchdog", () => {
  it("closes issues whose culprit is an ancestor of the green sha, with a comment", async () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const isAncestor = vi.fn(async () => true);
    const closeIssue = vi.fn(async () => {});

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => issues,
      isAncestor,
      closeIssue,
      greenSha: "green-sha",
    });

    expect(closed).toEqual([1]);
    expect(isAncestor).toHaveBeenCalledWith(SHA, "green-sha");
    expect(closeIssue).toHaveBeenCalledWith(1, buildRecoveryComment("green-sha"));
  });

  it("leaves issues open when the culprit is not yet an ancestor", async () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const closeIssue = vi.fn(async () => {});

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => issues,
      isAncestor: async () => false,
      closeIssue,
      greenSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("does nothing when there are no open watchdog issues", async () => {
    const closeIssue = vi.fn(async () => {});
    const isAncestor = vi.fn(async () => true);

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => [],
      isAncestor,
      closeIssue,
      greenSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(isAncestor).not.toHaveBeenCalled();
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("checks ancestry once per unique culprit sha, even with multiple issues", async () => {
    const issues = [
      { number: 1, title: buildBrokenMainTitle(SHA) },
      { number: 2, title: buildBrokenMainTitle(SHA) },
      { number: 3, title: buildBrokenMainTitle(OTHER_SHA) },
    ];
    const isAncestor = vi.fn(async () => true);

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => issues,
      isAncestor,
      closeIssue: async () => {},
      greenSha: "green-sha",
    });

    expect(closed.sort()).toEqual([1, 2, 3]);
    expect(isAncestor).toHaveBeenCalledTimes(2);
  });
});
