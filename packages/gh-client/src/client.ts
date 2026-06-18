import { createExecRunner } from "./exec-runner.js";
import type { ExecRunner, ExecRunnerOptions } from "./exec-runner.js";
import type { LabelTransition } from "./label-machine.js";

export interface GhClientOptions extends ExecRunnerOptions {
  runner?: ExecRunner;
}

function buildLabelArgs(transition: LabelTransition): string[] {
  const args: string[] = [];
  for (const label of transition.add) {
    args.push("--add-label", label);
  }
  for (const label of transition.remove) {
    args.push("--remove-label", label);
  }
  return args;
}

/**
 * Creates a typed gh CLI client with { pr, issue, label, workflow } facets.
 * The runner is injectable for testing; defaults to execFileSync.
 */
export function createGhClient(opts: GhClientOptions = {}) {
  const run = createExecRunner(opts);

  const issue = {
    list(args: string[]): unknown[] {
      const raw = run("gh", ["issue", "list", ...args]);
      return JSON.parse(raw) as unknown[];
    },

    view(number: number, args: string[] = []): unknown {
      const raw = run("gh", ["issue", "view", String(number), ...args]);
      return JSON.parse(raw);
    },

    create(args: string[]): string {
      return run("gh", ["issue", "create", ...args]);
    },

    comment(number: number, body: string): void {
      run("gh", ["issue", "comment", String(number), "--body", body]);
    },

    reopen(number: number): void {
      run("gh", ["issue", "reopen", String(number)]);
    },

    edit(number: number, args: string[]): void {
      run("gh", ["issue", "edit", String(number), ...args]);
    },
  };

  const pr = {
    view(number: number, args: string[] = []): unknown {
      const raw = run("gh", ["pr", "view", String(number), ...args]);
      return JSON.parse(raw);
    },

    create(args: string[]): string {
      return run("gh", ["pr", "create", ...args]);
    },
  };

  const label = {
    apply(transition: LabelTransition): void {
      const labelArgs = buildLabelArgs(transition);
      if (labelArgs.length === 0) return;
      run("gh", ["issue", "edit", String(transition.issueNumber), ...labelArgs]);
    },
  };

  const workflow = {
    runs(args: string[]): unknown[] {
      const raw = run("gh", ["run", "list", ...args]);
      return JSON.parse(raw) as unknown[];
    },
  };

  return { issue, pr, label, workflow };
}

export type GhClient = ReturnType<typeof createGhClient>;
