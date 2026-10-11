import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAgentCost, summarizeQueueSpend } from "../collect-agent-cost.mjs";

// agent-spend.jsonl is per-issue attribution only (logged by `mbe agent run`).
// It captures ~0.4% of actual Claude spend. Ground-truth totals come from the
// ccusage sensor (`collectCcusageSensor`), not from this collector.

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "collect-agent-cost-test-"));
}

describe("collectAgentCost", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
    mkdirSync(join(dir, ".claude"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("returns available: false when no spend file exists", () => {
    const result = collectAgentCost(join(dir, ".claude", "agent-spend.jsonl"));
    expect(result.available).toBe(false);
  });

  it("returns available: false when spend file has no entries", () => {
    const spendPath = join(dir, ".claude", "agent-spend.jsonl");
    writeFileSync(spendPath, "\n");
    const result = collectAgentCost(spendPath);
    expect(result.available).toBe(false);
  });

  it("returns available: true with cost when at least one in-window entry exists", () => {
    const spendPath = join(dir, ".claude", "agent-spend.jsonl");
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      spendPath,
      JSON.stringify({
        date: today,
        timestamp: new Date().toISOString(),
        costUsd: 0.5,
        model: "claude-sonnet-4-6",
      }) + "\n"
    );
    const result = collectAgentCost(spendPath);
    expect(result.available).toBe(true);
    expect(result.spend_today_usd).toBe(0.5);
    expect(result.spend_7d_usd).toBe(0.5);
    expect(result.sessions_7d).toBe(1);
  });

  it("surfaces token and turn fields when present in entries", () => {
    const spendPath = join(dir, ".claude", "agent-spend.jsonl");
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      spendPath,
      JSON.stringify({
        date: today,
        timestamp: new Date().toISOString(),
        costUsd: 0.42,
        model: "claude-sonnet-4-6",
        inputTokens: 1000,
        outputTokens: 500,
        numTurns: 8,
      }) +
        "\n" +
        JSON.stringify({
          date: today,
          timestamp: new Date().toISOString(),
          costUsd: 0.1,
          model: "claude-sonnet-4-6",
          inputTokens: 200,
          outputTokens: 100,
          numTurns: 3,
        }) +
        "\n"
    );
    const result = collectAgentCost(spendPath);
    expect(result.available).toBe(true);
    expect(result.total_input_tokens_7d).toBe(1200);
    expect(result.total_output_tokens_7d).toBe(600);
    expect(result.avg_turns_per_session).toBe(5.5);
  });

  it("parses legacy cost-only records (no token fields) without throwing", () => {
    const spendPath = join(dir, ".claude", "agent-spend.jsonl");
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      spendPath,
      JSON.stringify({ date: today, costUsd: 0.25, issueNumber: 99, model: null }) + "\n"
    );
    const result = collectAgentCost(spendPath);
    expect(result.available).toBe(true);
    expect(result.spend_today_usd).toBe(0.25);
    // Token fields absent in legacy records — should be 0 not NaN
    expect(result.total_input_tokens_7d).toBe(0);
    expect(result.total_output_tokens_7d).toBe(0);
    expect(result.avg_turns_per_session).toBe(0);
  });

  it("flags the result as attribution_only to distinguish from ground-truth totals", () => {
    const spendPath = join(dir, ".claude", "agent-spend.jsonl");
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      spendPath,
      JSON.stringify({ date: today, costUsd: 0.5, issueNumber: 42, model: "claude-sonnet-4-6" }) +
        "\n"
    );
    const result = collectAgentCost(spendPath);
    expect(result.available).toBe(true);
    // attribution_only: true signals that spend values cover only mbe-agent-run
    // sessions (per-issue), not total Claude spend. Use ccusage for ground-truth totals.
    expect(result.attribution_only).toBe(true);
  });

  it("ignores entries older than 7 days for 7d aggregates", () => {
    const spendPath = join(dir, ".claude", "agent-spend.jsonl");
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(
      spendPath,
      JSON.stringify({
        date: oldDate,
        costUsd: 1.0,
        inputTokens: 9999,
        outputTokens: 9999,
        numTurns: 50,
      }) +
        "\n" +
        JSON.stringify({
          date: today,
          costUsd: 0.1,
          inputTokens: 100,
          outputTokens: 50,
          numTurns: 2,
        }) +
        "\n"
    );
    const result = collectAgentCost(spendPath);
    expect(result.sessions_7d).toBe(1);
    expect(result.spend_7d_usd).toBe(0.1);
    expect(result.total_input_tokens_7d).toBe(100);
  });
});

// #5885: /implement-queue workers are Agent-tool subagents that never reach
// recordSpend; their usage lives in metrics/queue-telemetry.jsonl instead.
describe("summarizeQueueSpend", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const row = (over) => ({
    issue_number: 1,
    claimed_at: "2026-10-10T12:00:00Z",
    subagent_tokens: 1000,
    cost_usd: null,
    ...over,
  });

  it("returns null when no in-window row carries usage", () => {
    expect(summarizeQueueSpend([], now)).toBeNull();
    expect(summarizeQueueSpend([row({ subagent_tokens: null })], now)).toBeNull();
    expect(summarizeQueueSpend([row({ claimed_at: "2026-09-01T00:00:00Z" })], now)).toBeNull();
  });

  it("sums tokens and keeps cost null when no row knows its cost", () => {
    const result = summarizeQueueSpend([row(), row({ subagent_tokens: 500 })], now);
    expect(result).toEqual({
      sessions_7d: 2,
      sessions_without_usage_7d: 0,
      tokens_7d: 1500,
      cost_7d_usd: null,
      cost_known_sessions_7d: 0,
    });
  });

  it("sums only known costs and counts rows that carry no usage", () => {
    const result = summarizeQueueSpend(
      [row({ cost_usd: 0.4 }), row({ cost_usd: 0.35 }), row({ subagent_tokens: null })],
      now
    );
    expect(result.cost_7d_usd).toBe(0.75);
    expect(result.cost_known_sessions_7d).toBe(2);
    expect(result.sessions_without_usage_7d).toBe(1);
  });

  it("falls back to merged_at when claimed_at is absent", () => {
    const result = summarizeQueueSpend(
      [row({ claimed_at: undefined, merged_at: "2026-10-09T00:00:00Z" })],
      now
    );
    expect(result.sessions_7d).toBe(1);
  });
});

describe("collectAgentCost with queue telemetry", () => {
  let dir;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("is available from queue rows alone, with zero agent-core sessions", () => {
    const now = new Date();
    const queueRows = [{ issue_number: 1, claimed_at: now.toISOString(), subagent_tokens: 10 }];
    const result = collectAgentCost(join(dir, "missing.jsonl"), now, queueRows);
    expect(result.available).toBe(true);
    expect(result.sessions_7d).toBe(0);
    expect(result.spend_7d_usd).toBe(0);
    expect(result.queue.tokens_7d).toBe(10);
  });

  it("omits the queue block when there are no queue rows", () => {
    const result = collectAgentCost(join(dir, "missing.jsonl"), new Date(), []);
    expect(result).toEqual({ available: false });
  });
});
