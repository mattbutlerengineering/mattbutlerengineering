import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const __dirname = new URL(".", import.meta.url).pathname;
import { parseVerdict, decideReviewedMerge, REVIEWED_LABEL } from "../reviewed-merge.mjs";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const OWNER = "mattbutlerengineering";

const verdict = (body, login = OWNER, created_at = "2026-11-08T07:00:00Z") => ({
  body,
  user: { login },
  author_association: login === OWNER ? "OWNER" : "CONTRIBUTOR",
  created_at,
});

const basePr = (over = {}) => ({
  number: 42,
  state: "open",
  draft: false,
  title: "feat(x): do the thing",
  headSha: SHA,
  labels: [REVIEWED_LABEL],
  files: ["apps/hospitality/src/a.tsx"],
  ...over,
});

const input = (over = {}) => ({
  pr: basePr(over.pr),
  comments: over.comments ?? [verdict(`reviewed-merge: ${SHA} PASS 8/10\nreviewer notes`)],
  ownerLogin: OWNER,
  ciGate: "ciGate" in over ? over.ciGate : { status: "completed", conclusion: "success" },
});

describe("parseVerdict", () => {
  it("reads sha and score from the first line", () => {
    expect(parseVerdict(`reviewed-merge: ${SHA} PASS 9/10`)).toEqual({
      sha: SHA,
      score: 9,
      fastPath: false,
    });
  });
  it("reads the fast-path form", () => {
    expect(parseVerdict(`reviewed-merge: ${SHA} PASS fast-path`)).toEqual({
      sha: SHA,
      score: null,
      fastPath: true,
    });
  });
  it("ignores a verdict line that is not the first line", () => {
    expect(parseVerdict(`hello\nreviewed-merge: ${SHA} PASS 9/10`)).toBeNull();
  });
  it("rejects FLAG and short SHAs", () => {
    expect(parseVerdict(`reviewed-merge: ${SHA} FLAG 9/10`)).toBeNull();
    expect(parseVerdict(`reviewed-merge: abc123 PASS 9/10`)).toBeNull();
  });
});

describe("decideReviewedMerge", () => {
  it("merges a reviewed PR whose verdict matches the head and CI Gate is green", () => {
    const d = decideReviewedMerge(input());
    expect(d).toMatchObject({
      action: "merge",
      sha: SHA,
      commitTitle: "feat(x): do the thing (#42)",
    });
  });

  it.each([
    ["closed PR", { pr: { state: "closed" } }, /not open/],
    ["draft PR", { pr: { draft: true } }, /draft/],
    ["missing reviewed label", { pr: { labels: [] } }, /reviewed/],
    ["needs-review hold", { pr: { labels: [REVIEWED_LABEL, "needs-review"] } }, /needs-review/],
    ["gate path", { pr: { files: ["docs/adr/0099-x.md"] } }, /gate path/],
    ["no verdict", { comments: [] }, /no verdict/],
    [
      "verdict on an older head",
      { comments: [verdict(`reviewed-merge: ${OTHER} PASS 9/10`)] },
      /no verdict/,
    ],
    [
      "verdict by a non-owner",
      { comments: [verdict(`reviewed-merge: ${SHA} PASS 9/10`, "someone")] },
      /no verdict/,
    ],
    ["score below 7", { comments: [verdict(`reviewed-merge: ${SHA} PASS 6/10`)] }, /score/],
    ["CI Gate pending", { ciGate: { status: "in_progress", conclusion: null } }, /CI Gate/],
    ["CI Gate failed", { ciGate: { status: "completed", conclusion: "failure" } }, /CI Gate/],
    ["CI Gate missing", { ciGate: null }, /CI Gate/],
  ])("skips: %s", (_name, over, reason) => {
    const d = decideReviewedMerge(input(over));
    expect(d.action).toBe("skip");
    expect(d.reason).toMatch(reason);
  });

  it("uses the newest owner verdict for the head SHA", () => {
    const d = decideReviewedMerge(
      input({
        comments: [
          verdict(`reviewed-merge: ${SHA} PASS 9/10`, OWNER, "2026-11-08T07:00:00Z"),
          verdict(`reviewed-merge: ${SHA} PASS 5/10`, OWNER, "2026-11-08T08:00:00Z"),
        ],
      })
    );
    expect(d.action).toBe("skip");
  });

  it("merges on a fast-path verdict, still subject to the gate-path check", () => {
    const fast = [verdict(`reviewed-merge: ${SHA} PASS fast-path`)];
    expect(decideReviewedMerge(input({ comments: fast })).action).toBe("merge");
    expect(
      decideReviewedMerge(input({ comments: fast, pr: { files: ["docs/design/x.md"] } })).action
    ).toBe("skip");
  });
});

describe("routine prompts hand off in the format the parser accepts", () => {
  const { readFileSync } = require("node:fs");
  const { resolve } = require("node:path");
  const ROOT = resolve(__dirname, "../..");
  const promptOf = (name) =>
    /```text\n([\s\S]*?)\n```/.exec(
      readFileSync(resolve(ROOT, `docs/routines/${name}.md`), "utf8")
    )[1];

  it.each(["mbe-feature-drain", "mbe-prune", "mbe-daily-issue"])("%s", (name) => {
    const prompt = promptOf(name);
    const template = /`(reviewed-merge: <[^`]*> PASS <score>\/10)`/.exec(prompt);
    expect(template, "verdict template").not.toBeNull();
    expect(
      parseVerdict(template[1].replace(/<[^>]*SHA[^>]*>/, SHA).replace("<score>", "8"))
    ).toEqual({
      sha: SHA,
      score: 8,
      fastPath: false,
    });
    expect(prompt).toContain("`reviewed` label");
  });
});
