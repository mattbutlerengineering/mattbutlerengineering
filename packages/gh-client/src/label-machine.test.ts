import { describe, it, expect } from "vitest";
import {
  markInProgress,
  markHasPr,
  markFailed,
  markSkip,
  markReady,
  COORDINATION_LABELS,
} from "./label-machine.js";
import type { LabelTransition } from "./label-machine.js";

describe("COORDINATION_LABELS", () => {
  it("exports the canonical label set", () => {
    expect(COORDINATION_LABELS.READY).toBe("ready");
    expect(COORDINATION_LABELS.IN_PROGRESS).toBe("in-progress");
    expect(COORDINATION_LABELS.HAS_PR).toBe("has-pr");
    expect(COORDINATION_LABELS.AGENT_FAILED).toBe("agent-failed");
    expect(COORDINATION_LABELS.AGENT_SKIP).toBe("agent-skip");
  });
});

describe("markInProgress", () => {
  it("removes ready, adds in-progress", () => {
    const t = markInProgress(42);
    expect(t).toMatchObject<LabelTransition>({
      issueNumber: 42,
      add: ["in-progress"],
      remove: ["ready"],
    });
  });
});

describe("markHasPr", () => {
  it("removes in-progress and ready, adds has-pr", () => {
    const t = markHasPr(7);
    expect(t.issueNumber).toBe(7);
    expect(t.add).toContain("has-pr");
    expect(t.remove).toContain("in-progress");
    expect(t.remove).toContain("ready");
  });
});

describe("markFailed", () => {
  it("removes in-progress and ready, adds agent-failed", () => {
    const t = markFailed(3);
    expect(t.add).toContain("agent-failed");
    expect(t.remove).toContain("in-progress");
    expect(t.remove).toContain("ready");
  });
});

describe("markSkip", () => {
  it("removes in-progress, ready, and agent-failed, adds agent-skip", () => {
    const t = markSkip(5);
    expect(t.add).toContain("agent-skip");
    expect(t.remove).toContain("in-progress");
    expect(t.remove).toContain("ready");
    expect(t.remove).toContain("agent-failed");
  });
});

describe("markReady", () => {
  it("removes has-pr, in-progress, and agent-failed, adds ready", () => {
    const t = markReady(10);
    expect(t.add).toContain("ready");
    expect(t.remove).toContain("has-pr");
    expect(t.remove).toContain("in-progress");
    expect(t.remove).toContain("agent-failed");
  });
});
