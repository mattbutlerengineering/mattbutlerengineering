/**
 * End-to-end regression test for #5885: `/implement-queue` worker spend is
 * attributed by the `agentCost` sensor.
 *
 * Queue workers are Claude Code Agent-tool subagents — they never enter
 * `@mbe/agent-core`, so `recordSpend` (and `.claude/agent-spend/sessions.jsonl`)
 * can never see them. #3695, #4618, #5627 and #5696 each looked at the empty
 * sink in isolation; this test instead runs the orchestrator's real call path:
 *
 *   1. the exact `appendTelemetryRow(...)` snippet that
 *      `.claude/implement-queue.md` § "telemetry" (the queue profile hook)
 *      tells the orchestrator to run, executed by `node` in a temp repo root;
 *   2. the registry's `agentCost` sensor, reading that temp root.
 *
 * If the SKILL.md snippet stops recording usage, the writer moves, or the
 * sensor stops reading queue telemetry, this goes red.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { SENSORS } from "../sensors-registry.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL_PATH = join(REPO_ROOT, ".claude", "implement-queue.md");

/** The first ```js block under the profile's "telemetry" hook heading. */
function extractTelemetrySnippet() {
  const skill = readFileSync(SKILL_PATH, "utf-8");
  const section = skill.split("\n## telemetry\n")[1];
  if (!section) throw new Error("implement-queue.md has no 'telemetry' hook section");
  const match = section.match(/```js\n([\s\S]*?)```/);
  if (!match) throw new Error("'telemetry' hook has no js snippet");
  return match[1];
}

// The free variables the snippet expects the orchestrator to have in scope
// after a worker completes: the Agent tool's completion <usage> carries
// total tokens, tool uses and duration — never a dollar cost.
const ORCHESTRATOR_SCOPE = `
const claimedAt = Date.now() - 60_000;
const claimedAtIso = new Date(claimedAt).toISOString();
const usage = { totalTokens: 123456, toolUses: 42 };
const prNumber = 9999;
const verdict = "pass";
`;

describe("queue worker spend attribution (#5885)", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "queue-spend-attribution-"));
    // The writer resolves its sink from its own location (metrics-store's
    // DEFAULT_ROOT), so copying both modules makes the unmodified snippet
    // write into this temp root instead of the real repo.
    mkdirSync(join(root, "scripts"));
    for (const f of ["queue-telemetry-store.mjs", "metrics-store.mjs"]) {
      copyFileSync(join(REPO_ROOT, "scripts", f), join(root, "scripts", f));
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("a row written by the SKILL.md snippet is attributed by the agentCost sensor", () => {
    const snippet = extractTelemetrySnippet();
    const imports = snippet.match(/^import .*$/gm) ?? [];
    const body = snippet.replace(/^import .*$/gm, "");
    execFileSync(
      process.execPath,
      ["--input-type=module", "-e", [...imports, ORCHESTRATOR_SCOPE, body].join("\n")],
      { cwd: root, stdio: "pipe" }
    );
    expect(existsSync(join(root, "metrics", "queue-telemetry.jsonl"))).toBe(true);

    const sensor = SENSORS.find((s) => s.id === "agentCost");
    const data = sensor.collect({ root, now: new Date() });

    expect(data.available).toBe(true);
    expect(data.queue).toMatchObject({
      sessions_7d: 1,
      tokens_7d: 123456,
      // Unknown cost stays unknown — never estimated from tokens.
      cost_7d_usd: null,
    });
    // Queue rows never land in the agent-core sink, so no double count.
    expect(data.sessions_7d).toBe(0);
    expect(sensor.format(data, "agentCost")).toContain("1 queue worker");
  });
});
