import { describe, it, expect } from "vitest";
import { formatMutationIssue } from "../format-mutation-issue.mjs";

const RUN_URL = "https://github.com/o/r/actions/runs/35622179696";
const BASE = { threshold: 80, runUrl: RUN_URL, today: "2026-09-21" };

describe("formatMutationIssue", () => {
  it("files a distinct issue for a broken harness, never the below-target one", () => {
    // #5614 filed "Mutation testing below target / **Score:** 0%" for a run
    // that measured nothing. The title is the dedupe key AND the first thing
    // a reader sees, so it must not claim a score that was never taken.
    const broken = formatMutationIssue({ ...BASE, state: "harness-broken", score: "n/a" });
    const scored = formatMutationIssue({ ...BASE, state: "scored", score: 55.56 });

    expect(broken.title).not.toBe(scored.title);
    expect(broken.dedupeKey).not.toBe(scored.dedupeKey);
    expect(broken.title).toContain("harness");
    expect(broken.body).not.toContain("0%");
    expect(broken.body).not.toContain("Add tests to kill surviving mutants");
    expect(broken.body).toContain("testsCompleted: 0");
    expect(broken.body).toContain(RUN_URL);
  });

  it("keeps the existing below-target issue intact for a genuine low score", () => {
    const issue = formatMutationIssue({ ...BASE, state: "scored", score: 55.56 });
    expect(issue.title).toBe("Mutation testing below target");
    expect(issue.dedupeKey).toBe("mutation-testing-below-target");
    expect(issue.body).toContain("**Score:** 55.56%");
    expect(issue.body).toContain("80% target");
    expect(issue.body).toContain("Add tests to kill surviving mutants");
  });

  it("reports a missing report as its own state rather than a zero score", () => {
    const issue = formatMutationIssue({ ...BASE, state: "report-missing", score: "n/a" });
    expect(issue.title).toContain("no report");
    expect(issue.body).not.toContain("0%");
  });

  it("emits a recurrence comment that matches the state", () => {
    const broken = formatMutationIssue({ ...BASE, state: "harness-broken", score: "n/a" });
    expect(broken.comment).toContain("2026-09-21");
    expect(broken.comment).toContain(RUN_URL);
    expect(broken.comment).not.toContain("score 0%");

    const scored = formatMutationIssue({ ...BASE, state: "scored", score: 55.56 });
    expect(scored.comment).toContain("55.56%");
  });
});
