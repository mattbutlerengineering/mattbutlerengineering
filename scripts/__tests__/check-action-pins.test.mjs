/**
 * Guard for #9222: every external `uses:` must be pinned to a commit SHA,
 * because a tag or branch can be moved by whoever controls the action's repo.
 */

import { describe, it, expect } from "vitest";
import { checkWorkflow, findUnpinnedActions } from "../check-action-pins.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

describe("checkWorkflow", () => {
  it("flags an action used by tag, with its line number", () => {
    const content = ["steps:", "  - uses: actions/checkout@v7.0.1"].join("\n");
    expect(checkWorkflow("w.yml", content).errors).toEqual([
      { line: 2, message: "`actions/checkout@v7.0.1` is not pinned to a 40-character commit SHA" },
    ]);
  });

  it("flags a branch ref, a short SHA and a missing ref", () => {
    const content = [
      "  - uses: pnpm/action-setup@v3",
      "    uses: actions/setup-node@949feb2",
      "  - uses: some/action",
    ].join("\n");
    expect(checkWorkflow("w.yml", content).errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it("accepts a full SHA with or without a version comment, and quoted", () => {
    const content = [
      `  - uses: actions/checkout@${SHA} # v7.0.1`,
      `    uses: actions/checkout@${SHA}`,
      `  - uses: "actions/checkout@${SHA}"`,
      `  - uses: github/codeql-action/init@${SHA} # v3`,
    ].join("\n");
    expect(checkWorkflow("w.yml", content).errors).toEqual([]);
  });

  it("skips local actions and docker images", () => {
    const content = ["  - uses: ./.github/actions/setup", "  - uses: docker://alpine:3.20"].join(
      "\n"
    );
    expect(checkWorkflow("w.yml", content).errors).toEqual([]);
  });

  it("ignores `uses:` text that is not a key", () => {
    const content = ["  run: echo 'uses: actions/checkout@v4'"].join("\n");
    expect(checkWorkflow("w.yml", content).errors).toEqual([]);
  });
});

describe("the real repository", () => {
  it("pins every external action to a commit SHA", () => {
    expect(findUnpinnedActions().findings).toEqual([]);
  });
});
