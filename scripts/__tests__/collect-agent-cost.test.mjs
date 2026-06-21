import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAgentCost } from "../collect-agent-cost.mjs";

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
