import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/revert-watchdog.yml"), "utf8");

// The job block runs from its key to the next top-level job (two-space key).
function jobBlock(name) {
  const match = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:\\n|(?![\\s\\S]))`, "m").exec(
    WORKFLOW
  );
  return match?.[1] ?? "";
}

describe("revert-watchdog reopen-culprit-issues job", () => {
  const job = jobBlock("reopen-culprit-issues");

  it("exists and invokes the reopen subcommand", () => {
    expect(job).not.toBe("");
    expect(job).toMatch(/node scripts\/revert-watchdog\.mjs reopen-culprit-issues --pr/);
  });

  it("runs only for merged revert PRs", () => {
    const cond = /^ {4}if: (.*)$/m.exec(job)?.[1] ?? "";
    expect(cond).toContain("github.event_name == 'pull_request'");
    expect(cond).toContain("github.event.pull_request.merged == true");
    expect(cond).toContain("startsWith(github.event.pull_request.title, 'revert:')");
  });

  it("is triggered by closed pull_request events on main", () => {
    expect(WORKFLOW).toMatch(/pull_request:\n\s+types: \[closed\]\n\s+branches: \[main\]/);
  });

  it("is the only job that handles pull_request events", () => {
    for (const other of ["on-failure", "close-stale-reverts"]) {
      const block = jobBlock(other);
      if (block === "") continue;
      expect(block).not.toMatch(/event_name == 'pull_request'/);
    }
  });
});
