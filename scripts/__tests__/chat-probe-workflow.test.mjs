import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = readFileSync(join(root, ".github/workflows/chat-probe.yml"), "utf-8");
const runner = readFileSync(join(root, "scripts/chat-probe.mjs"), "utf-8");

describe("chat-probe workflow", () => {
  it("triggers after Deploy Services, on demand and daily", () => {
    expect(workflow).toMatch(/workflows: \["Deploy Services"\]/);
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("schedule:");
  });

  it("has least-privilege permissions and pipefail in piped run blocks", () => {
    expect(workflow).toMatch(/permissions:\n {2}contents: read\n {2}issues: write/);
    expect(workflow).toContain("set -o pipefail");
  });

  it("skips visibly when the venue secret is unset", () => {
    expect(workflow).toContain("CHAT_PROBE_VENUE_ID");
    expect(workflow).toContain("::notice::Chat probe skipped");
  });

  it("files through the shared issue-filing CLI, not raw gh issue create", () => {
    expect(workflow).toContain("scripts/lib/file-issue-cli.mjs");
    expect(workflow).not.toMatch(/gh issue create/);
  });

  it("pins every action by sha", () => {
    for (const line of workflow.split("\n").filter((l) => l.includes("uses:"))) {
      expect(line).toMatch(/@[0-9a-f]{40}/);
    }
  });
});

describe("chat-probe runner never confirms", () => {
  it("has no confirm path", () => {
    expect(runner).not.toContain("actionConfirm");
    expect(workflow).not.toContain("actionConfirm");
  });
});
