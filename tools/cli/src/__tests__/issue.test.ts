import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGhClient } from "@mbe/gh-client";
import type { ExecRunner } from "@mbe/gh-client";
import {
  issueCommand,
  transitionIssue,
  isValidTransitionState,
  VALID_TRANSITION_STATES,
} from "../commands/issue.js";

// ── Test helpers ─────────────────────────────────────────────────────────

function makeRunner() {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const runner: ExecRunner = (cmd, args) => {
    calls.push({ cmd, args });
    return "";
  };
  return { runner, calls };
}

// ── transitionIssue: every label-machine edge ───────────────────────────

describe("transitionIssue", () => {
  it("applies the ready→in-progress edge", () => {
    const { runner, calls } = makeRunner();
    const client = createGhClient({ runner });

    transitionIssue(42, "in-progress", client);

    expect(calls).toEqual([
      {
        cmd: "gh",
        args: ["issue", "edit", "42", "--add-label", "in-progress", "--remove-label", "ready"],
      },
    ]);
  });

  it("applies the in-progress→has-pr edge", () => {
    const { runner, calls } = makeRunner();
    const client = createGhClient({ runner });

    transitionIssue(7, "has-pr", client);

    expect(calls).toEqual([
      {
        cmd: "gh",
        args: [
          "issue",
          "edit",
          "7",
          "--add-label",
          "has-pr",
          "--remove-label",
          "in-progress",
          "--remove-label",
          "ready",
        ],
      },
    ]);
  });

  it("applies the in-progress→agent-failed edge", () => {
    const { runner, calls } = makeRunner();
    const client = createGhClient({ runner });

    transitionIssue(3, "agent-failed", client);

    expect(calls).toEqual([
      {
        cmd: "gh",
        args: [
          "issue",
          "edit",
          "3",
          "--add-label",
          "agent-failed",
          "--remove-label",
          "in-progress",
          "--remove-label",
          "ready",
        ],
      },
    ]);
  });

  it("applies the agent-failed→agent-skip edge", () => {
    const { runner, calls } = makeRunner();
    const client = createGhClient({ runner });

    transitionIssue(5, "agent-skip", client);

    expect(calls).toEqual([
      {
        cmd: "gh",
        args: [
          "issue",
          "edit",
          "5",
          "--add-label",
          "agent-skip",
          "--remove-label",
          "in-progress",
          "--remove-label",
          "ready",
          "--remove-label",
          "agent-failed",
        ],
      },
    ]);
  });

  it("applies the has-pr/agent-failed→ready re-queue edge", () => {
    const { runner, calls } = makeRunner();
    const client = createGhClient({ runner });

    transitionIssue(10, "ready", client);

    expect(calls).toEqual([
      {
        cmd: "gh",
        args: [
          "issue",
          "edit",
          "10",
          "--add-label",
          "ready",
          "--remove-label",
          "has-pr",
          "--remove-label",
          "in-progress",
          "--remove-label",
          "agent-failed",
        ],
      },
    ]);
  });
});

// ── isValidTransitionState ───────────────────────────────────────────────

describe("isValidTransitionState", () => {
  it("accepts every canonical state", () => {
    for (const state of VALID_TRANSITION_STATES) {
      expect(isValidTransitionState(state)).toBe(true);
    }
  });

  it("rejects an unknown state string", () => {
    expect(isValidTransitionState("bogus")).toBe(false);
    expect(isValidTransitionState("")).toBe(false);
    expect(isValidTransitionState("READY")).toBe(false);
  });
});

// ── CLI action: rejection paths (no gh invocation) ──────────────────────

describe("issue transition command", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function run(args: string[]): Promise<void> {
    await issueCommand.parseAsync(["transition", ...args], { from: "user" });
  }

  it("rejects an unknown --to state with a non-zero exit and a clear message", async () => {
    await run(["123", "--to", "bogus"]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("bogus"));
  });

  it("rejects a non-numeric issue number with a non-zero exit and a clear message", async () => {
    await run(["not-a-number", "--to", "ready"]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not-a-number"));
  });

  it("rejects a non-positive issue number", async () => {
    await run(["0", "--to", "ready"]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("0"));
  });
});
