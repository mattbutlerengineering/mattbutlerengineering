/**
 * Pins the PR batching rules (#10188). Many small PRs saturated the CI queue:
 * every open PR sat queued, and merges kept cancelling the deploy's main CI
 * run (#9948). Routines and queue workers now open one PR per fire or per
 * zone batch, never one per root cause or per issue.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Collapse whitespace so prose rewrapping by prettier never breaks a pin.
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8").replace(/\s+/g, " ");

describe("PR batching (#10188)", () => {
  it("fix protocol opens one pull request per fire, not per root cause", () => {
    const protocol = read("docs/routines/fix-protocol.md");
    expect(protocol).toContain("Open one pull request per fire");
    expect(protocol).not.toContain("one pull request per root cause");
    expect(protocol).toMatch(/Each root cause is its own commit/);
  });

  it("fix protocol never pushes to a PR whose CI is queued and keeps one open PR per routine", () => {
    const protocol = read("docs/routines/fix-protocol.md");
    expect(protocol).toMatch(/Never push to a pull request whose CI is queued or running/);
    expect(protocol).toMatch(
      /Never open a second pull request while your routine already has one open/
    );
  });

  it("implement-queue dispatches one worker per zone batch, not per issue", () => {
    const profile = read(".claude/implement-queue.md");
    expect(profile).not.toContain("Dispatch one subagent per issue");
    expect(profile).toMatch(/one worker per zone batch/);
    expect(profile).toMatch(/up to 3 issues/);
  });

  it("the queue worker accepts a batch of issues and opens one PR for it", () => {
    const worker = read(".claude/agents/implement-queue-worker.md");
    expect(worker).toMatch(/one pull request for the whole batch/i);
  });

  it("per-routine caps count findings in one PR, not PRs", () => {
    for (const name of ["mbe-learning-loop", "mbe-ui-quality"]) {
      const prompt = read(`docs/routines/${name}.md`);
      expect(prompt, name).not.toMatch(/at most (two|three|2|3) fix PRs/i);
    }
  });

  it("mbe-hourly-fix keeps one open PR and batches its findings into it", () => {
    const prompt = read("docs/routines/mbe-hourly-fix.md");
    expect(prompt).toMatch(/If one or more are open, open no new PR this fire/);
    expect(prompt).toMatch(/up to 4 findings/);
  });

  it("interactive sessions get the batching rule in gotchas", () => {
    expect(read(".claude/rules/gotchas.md")).toContain("#10188");
  });
});
