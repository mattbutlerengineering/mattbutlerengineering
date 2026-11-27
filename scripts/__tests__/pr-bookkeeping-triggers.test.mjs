import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

// #10011: per-PR bookkeeping workflows skip cheaply when their outcome cannot
// change. A job skipped by `if:` takes no runner.
const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)), "utf-8");

describe("auto-merge.yml (Auto-Merge Policy)", () => {
  const src = read("auto-merge.yml");

  it("skips pull_request_target events for PRs without the auto-merge label", () => {
    expect(src).toMatch(
      /github\.event_name == 'pull_request_target' &&\s*contains\(github\.event\.pull_request\.labels\.\*\.name, 'auto-merge'\)/
    );
  });

  it("keeps the check_suite re-evaluation path", () => {
    expect(src).toMatch(/check_suite:\s*\n\s*types: \[completed\]/);
    expect(src).toContain("github.event.check_suite.conclusion == 'success'");
  });
});

describe("merge-queue.yml", () => {
  const src = read("merge-queue.yml");

  it("skips PR events unless the PR carries has-pr or needs-review", () => {
    expect(src).toContain("github.event_name != 'pull_request_target'");
    expect(src).toContain("contains(github.event.pull_request.labels.*.name, 'has-pr')");
    expect(src).toContain("contains(github.event.pull_request.labels.*.name, 'needs-review')");
  });

  it("still runs on schedule and dispatch, and keeps every PR event type", () => {
    expect(src).toContain("types: [labeled, unlabeled, synchronize, opened, reopened]");
    expect(src).toContain("schedule:");
    expect(src).toContain("workflow_dispatch");
  });
});

describe("ai-attribution.yml", () => {
  it("skips when agent-authored is already on the PR", () => {
    expect(read("ai-attribution.yml")).toMatch(
      /if: \$\{\{ !contains\(github\.event\.pull_request\.labels\.\*\.name, 'agent-authored'\) \}\}/
    );
  });
});

describe("adr-check.yml", () => {
  // ci.yml's architecture-audit chains to `prepare` (gated on has_code), so an
  // ADR-only markdown PR gets no check-adr there; this workflow must cover it.
  const doc = load(read("adr-check.yml"));
  const on = doc.on ?? doc[true];

  it("triggers on PRs only for check-adr inputs, including docs/adr/**", () => {
    expect(on.pull_request.branches).toEqual(["main"]);
    expect(on.pull_request.paths).toEqual(
      expect.arrayContaining([
        "docs/adr/**",
        "tools/cli/src/check-adr.ts",
        "tools/cli/src/commands/adr*.ts",
      ])
    );
  });

  it("still audits every push to main", () => {
    expect(on.push.branches).toEqual(["main"]);
    expect(on.push.paths).toBeUndefined();
  });
});
