import { describe, it, expect } from "vitest";
import { appendTelemetryRow, HUMAN_TOUCH_REASONS } from "../collect-queue-telemetry.mjs";

// ── Helpers ──────────────────────────────────────────────

function makeStore(initial = "") {
  let content = initial;
  return {
    readFile: () => content || null,
    writeFile: (_path, data) => {
      content = data;
    },
    getContent: () => content,
  };
}

function makeRow(overrides = {}) {
  return {
    issue_number: 1,
    labels: ["feature", "ready"],
    model_tier: "sonnet",
    subagent_tokens: 50000,
    tool_uses: 12,
    duration_ms: 45000,
    pr_number: 101,
    merged: false,
    ci_first_pass: null,
    rework_cycles: 0,
    reviewer_verdict: "skipped",
    claimed_at: "2026-06-27T10:00:00.000Z",
    merged_at: null,
    ...overrides,
  };
}

// ── Writer tests ─────────────────────────────────────────

describe("appendTelemetryRow", () => {
  it("writes a new row and returns { written: true }", () => {
    const store = makeStore();
    const result = appendTelemetryRow(makeRow(), store);
    expect(result.written).toBe(true);
    const lines = store.getContent().trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.issue_number).toBe(1);
    expect(parsed.pr_number).toBe(101);
  });

  it("appends to an existing file without corrupting prior entries", () => {
    const existing = JSON.stringify(makeRow({ issue_number: 99, pr_number: 999 })) + "\n";
    const store = makeStore(existing);
    appendTelemetryRow(makeRow(), store);
    const lines = store.getContent().trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).issue_number).toBe(99);
    expect(JSON.parse(lines[1]).issue_number).toBe(1);
  });

  it("is idempotent — skips a duplicate (issue_number, pr_number) pair", () => {
    const store = makeStore();
    appendTelemetryRow(makeRow(), store);
    const result = appendTelemetryRow(makeRow(), store);
    expect(result.written).toBe(false);
    expect(result.reason).toBe("duplicate");
    const lines = store.getContent().trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("allows two rows with the same issue_number but different pr_numbers", () => {
    const store = makeStore();
    appendTelemetryRow(makeRow({ pr_number: 101 }), store);
    const result = appendTelemetryRow(makeRow({ pr_number: 102 }), store);
    expect(result.written).toBe(true);
    const lines = store.getContent().trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("allows a row without pr_number — always writes (no dedup key)", () => {
    const store = makeStore();
    const row = makeRow();
    delete row.pr_number;
    const r1 = appendTelemetryRow(row, store);
    expect(r1.written).toBe(true);
  });

  it("accepts optional cost_usd field alongside subagent_tokens", () => {
    const store = makeStore();
    const result = appendTelemetryRow(makeRow({ cost_usd: 0.42 }), store);
    expect(result.written).toBe(true);
    const parsed = JSON.parse(store.getContent().trim());
    expect(parsed.cost_usd).toBe(0.42);
  });

  it("throws on unknown fields that could be secrets", () => {
    const store = makeStore();
    expect(() => appendTelemetryRow(makeRow({ api_key: "sk-secret" }), store)).toThrow(
      /unknown field/
    );
  });

  it("throws when issue_number is missing", () => {
    const store = makeStore();
    const row = makeRow();
    delete row.issue_number;
    expect(() => appendTelemetryRow(row, store)).toThrow(/issue_number/);
  });

  it("throws when issue_number is not a number", () => {
    const store = makeStore();
    expect(() => appendTelemetryRow(makeRow({ issue_number: "not-a-number" }), store)).toThrow(
      /issue_number/
    );
  });

  it("handles a null readFile return (empty sink) gracefully", () => {
    const store = { readFile: () => null, writeFile: () => {} };
    const result = appendTelemetryRow(makeRow(), store);
    expect(result.written).toBe(true);
  });

  it("skips malformed JSON lines when reading existing sink", () => {
    const store = makeStore("not-valid-json\n");
    const result = appendTelemetryRow(makeRow(), store);
    expect(result.written).toBe(true);
  });

  it("writes a row without human_touch_reason — field stays optional", () => {
    const store = makeStore();
    const row = makeRow();
    expect(row.human_touch_reason).toBeUndefined();
    const result = appendTelemetryRow(row, store);
    expect(result.written).toBe(true);
    const parsed = JSON.parse(store.getContent().trim());
    expect(parsed.human_touch_reason).toBeUndefined();
  });

  it("accepts a valid human_touch_reason from the taxonomy", () => {
    const store = makeStore();
    const result = appendTelemetryRow(makeRow({ human_touch_reason: "ci-failure" }), store);
    expect(result.written).toBe(true);
    const parsed = JSON.parse(store.getContent().trim());
    expect(parsed.human_touch_reason).toBe("ci-failure");
  });

  it("exports HUMAN_TOUCH_REASONS as the single source of truth for the taxonomy", () => {
    expect(HUMAN_TOUCH_REASONS).toEqual([
      "review-fix",
      "ci-failure",
      "merge-conflict",
      "lint-fixup",
      "generated-artifact-regen",
      "ci-rerun",
      "scope-change",
      "other",
    ]);
  });

  it("throws when human_touch_reason is not in the taxonomy", () => {
    const store = makeStore();
    expect(() => appendTelemetryRow(makeRow({ human_touch_reason: "gremlins" }), store)).toThrow(
      /human_touch_reason/
    );
  });

  it("reads existing rows that predate the human_touch_reason field without error", () => {
    // Simulates append-only historical rows written before this field existed.
    const legacyRow = makeRow({ issue_number: 42, pr_number: 4242 });
    const existing = JSON.stringify(legacyRow) + "\n";
    const store = makeStore(existing);
    const result = appendTelemetryRow(makeRow({ pr_number: 555 }), store);
    expect(result.written).toBe(true);
    const lines = store.getContent().trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).human_touch_reason).toBeUndefined();
  });

  it("does not write credential-like patterns into the JSONL output", () => {
    const store = makeStore();
    appendTelemetryRow(makeRow({ cost_usd: 1.23 }), store);
    const content = store.getContent();
    // Check that no API-key-style secrets leaked (sk-... prefix, password=, api_key=)
    expect(content).not.toMatch(/sk-[a-zA-Z0-9]/);
    expect(content).not.toMatch(/password\s*[:=]/i);
    expect(content).not.toMatch(/api[_-]key\s*[:=]/i);
    // Confirm only the expected schema fields are present (no extra blobs)
    const parsed = JSON.parse(content.trim());
    const writtenKeys = Object.keys(parsed);
    for (const key of writtenKeys) {
      expect([
        "issue_number",
        "labels",
        "model_tier",
        "subagent_tokens",
        "tool_uses",
        "duration_ms",
        "pr_number",
        "merged",
        "ci_first_pass",
        "rework_cycles",
        "reviewer_verdict",
        "claimed_at",
        "merged_at",
        "cost_usd",
      ]).toContain(key);
    }
  });
});
