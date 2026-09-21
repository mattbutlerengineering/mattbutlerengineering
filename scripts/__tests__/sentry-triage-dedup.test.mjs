import { describe, test, expect } from "vitest";

/**
 * Regression tests for #5553 — Sentry issue `7734806348` was filed as a
 * NEW GitHub issue four times in five days (#5418, #5446, #5469, #5536)
 * because `triage.mjs`'s dedup search restricted itself to `state:open`,
 * so every earlier filing had already been closed by the time the next
 * run searched for it.
 *
 * The #5469/#5536 fixture bodies below are verbatim (`gh issue view 5469
 * --json body` / `--json body`, fetched 2026-09-20) — byte-identical, both
 * carrying `**Sentry Issue:** https://sentry.io/organizations/
 * mattbutlerengineering/issues/7734806348/`.
 */
const ISSUE_5469_BODY =
  "## Sentry Production Error\n\n" +
  "**Sentry Issue:** https://sentry.io/organizations/mattbutlerengineering/issues/7734806348/\n" +
  "**Project:** reservations-api\n" +
  "**Level:** error\n" +
  "**Events:** 94 in last 14 days\n" +
  "**Affected Users:** 0\n\n" +
  "## Acceptance Criteria\n\n" +
  "- [ ] Error rate drops >50% after fix\n" +
  "- [ ] Verified by learning-loop post-fix check\n\n" +
  "_Detected by sentry-triage_";

const ISSUE_5536_BODY = ISSUE_5469_BODY;

describe("sentry-triage-dedup", () => {
  describe("extractSentryIssueId", () => {
    test("parses the Sentry issue ID out of the body's URL", async () => {
      const { extractSentryIssueId } = await import("../sentry-triage-dedup.mjs");

      expect(extractSentryIssueId(ISSUE_5469_BODY)).toBe("7734806348");
    });

    test("returns null when the body carries no Sentry URL", async () => {
      const { extractSentryIssueId } = await import("../sentry-triage-dedup.mjs");

      expect(extractSentryIssueId("no sentry link here")).toBeNull();
      expect(extractSentryIssueId("")).toBeNull();
      expect(extractSentryIssueId(undefined)).toBeNull();
    });
  });

  describe("decideSentryDedup", () => {
    test("no match -> file", async () => {
      const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");

      const existingIssues = [{ number: 1, state: "OPEN", body: "unrelated issue, no sentry url" }];

      const decision = decideSentryDedup("7734806348", existingIssues);

      expect(decision.action).toBe("file");
    });

    test("open match -> skip", async () => {
      const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");

      const existingIssues = [{ number: 5446, state: "OPEN", body: ISSUE_5469_BODY }];

      const decision = decideSentryDedup("7734806348", existingIssues);

      expect(decision.action).toBe("skip");
      expect(decision.reason).toBe("open-match");
      expect(decision.matchedIssue).toBe(5446);
    });

    test("closed match -> skip", async () => {
      const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");

      const existingIssues = [{ number: 5469, state: "CLOSED", body: ISSUE_5469_BODY }];

      const decision = decideSentryDedup("7734806348", existingIssues);

      expect(decision.action).toBe("skip");
      expect(decision.reason).toBe("closed-match");
      expect(decision.matchedIssue).toBe(5469);
    });

    test("search-unavailable (existingIssues === null) -> skip, fail closed", async () => {
      const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");

      const decision = decideSentryDedup("7734806348", null);

      expect(decision.action).toBe("skip");
      expect(decision.reason).toBe("search-unavailable");
    });

    test("never keys on the title string — identical title, different Sentry ID, is not a match", async () => {
      const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");

      const existingIssues = [
        {
          number: 999,
          state: "CLOSED",
          body: "**Sentry Issue:** https://sentry.io/organizations/mattbutlerengineering/issues/1111111111/\n",
        },
      ];

      const decision = decideSentryDedup("7734806348", existingIssues);

      expect(decision.action).toBe("file");
    });

    test("#5469/#5536 regression: a closed #5469 in the existing set stops the #5536 filing", async () => {
      const { decideSentryDedup, extractSentryIssueId } =
        await import("../sentry-triage-dedup.mjs");

      // What triage.mjs would have found on the day #5536 was filed, had it
      // searched state:all instead of state:open.
      const existingIssues = [{ number: 5469, state: "CLOSED", body: ISSUE_5469_BODY }];
      const candidateId = extractSentryIssueId(ISSUE_5536_BODY);

      const decision = decideSentryDedup(candidateId, existingIssues);

      expect(decision.action).toBe("skip");
      expect(decision.reason).toBe("closed-match");
      expect(decision.matchedIssue).toBe(5469);
    });
  });
});

describe("decideSentryDedup guards its own contract", () => {
  test("skips an unparseable candidate id instead of matching null to null", async () => {
    const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");
    // Before the guard, `extractSentryIssueId(body) === sentryIssueId` compared
    // null to null, so an issue carrying no Sentry URL was reported as a match
    // — complete with that issue's number.
    expect(decideSentryDedup(null, [{ number: 3, state: "open", body: "no url here" }])).toEqual({
      action: "skip",
      reason: "unparseable-candidate-id",
    });
  });

  test("still skips on an empty-string id", async () => {
    const { decideSentryDedup } = await import("../sentry-triage-dedup.mjs");
    expect(decideSentryDedup("", [{ number: 3, state: "open", body: "no url here" }])).toEqual({
      action: "skip",
      reason: "unparseable-candidate-id",
    });
  });
});
