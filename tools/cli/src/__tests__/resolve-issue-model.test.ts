import { describe, it, expect } from "vitest";
import {
  resolveIssueModel,
  resolveEscalatedModel,
  buildSpendAttempts,
} from "../resolve-issue-model.js";

describe("resolveIssueModel", () => {
  it("uses an explicit agent-frontmatter model override over the router", () => {
    const body = ["```yaml agent", "model: haiku", "```", "", "Big architectural refactor."].join(
      "\n"
    );
    const result = resolveIssueModel({
      title: "feat: migrate the schema across services",
      labels: ["feature"],
      body,
    });

    expect(result.source).toBe("frontmatter");
    expect(result.tier).toBe("haiku");
    expect(result.modelId).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to the router when there is no frontmatter override", () => {
    const result = resolveIssueModel({
      title: "feat: add a refactor that introduces a schema change",
      labels: ["feature"],
      body: "This requires a breaking change across multiple services.",
    });

    expect(result.source).toBe("router");
    expect(result.tier).toBe("opus");
    expect(result.modelId).toBe("claude-opus-4-8");
  });

  it("routes a ci-fix label to sonnet via the router", () => {
    const result = resolveIssueModel({
      title: "fix: failing lint on main",
      labels: ["ci-fix"],
      body: "",
    });

    expect(result.source).toBe("router");
    expect(result.tier).toBe("sonnet");
    expect(result.modelId).toBe("claude-sonnet-4-6");
  });

  it("routes a lightweight dependency bump to haiku via the router", () => {
    const result = resolveIssueModel({
      title: "chore(deps): bump zod to 4.1.2",
      labels: ["ci-fix"],
      body: "Dependabot bump.",
    });

    expect(result.source).toBe("router");
    expect(result.tier).toBe("haiku");
    expect(result.modelId).toBe("claude-haiku-4-5-20251001");
  });

  it("ignores a malformed agent block and falls back to the router", () => {
    const body = ["```yaml agent", "model: not-a-real-tier", "```"].join("\n");
    const result = resolveIssueModel({
      title: "fix: small copy tweak",
      labels: ["feature"],
      body,
    });

    expect(result.source).toBe("router");
    expect(result.tier).toBe("sonnet");
  });
});

// ── resolveEscalatedModel (#2031) ────────────────────────────────────

describe("resolveEscalatedModel", () => {
  const issueWithEscalate = (escalateTier: string) => ({
    title: "chore(deps): bump lodash",
    labels: [] as string[],
    body: ["```yaml agent", "model: haiku", `escalate: ${escalateTier}`, "```"].join("\n"),
  });

  it("returns null when escalate is not set in frontmatter", () => {
    const issue = {
      title: "chore(deps): bump lodash",
      labels: [] as string[],
      body: ["```yaml agent", "model: haiku", "```"].join("\n"),
    };
    expect(resolveEscalatedModel(issue)).toBeNull();
  });

  it("returns null when there is no frontmatter at all", () => {
    const issue = { title: "Fix login bug", labels: [] as string[], body: "No block here." };
    expect(resolveEscalatedModel(issue)).toBeNull();
  });

  it("returns escalated model result at the declared tier", () => {
    const result = resolveEscalatedModel(issueWithEscalate("sonnet"));
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("sonnet");
    expect(result!.modelId).toBe("claude-sonnet-4-6");
    expect(result!.source).toBe("escalate");
  });

  it("returns escalated model result at opus tier", () => {
    const result = resolveEscalatedModel(issueWithEscalate("opus"));
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("opus");
    expect(result!.modelId).toBe("claude-opus-4-8");
  });

  it("reason string mentions escalation and the declared tier", () => {
    const result = resolveEscalatedModel(issueWithEscalate("sonnet"));
    expect(result!.reason).toMatch(/escalat/i);
    expect(result!.reason).toMatch(/sonnet/i);
  });

  it("returns null when escalate field is invalid (parse warning path)", () => {
    const issue = {
      title: "chore(deps): bump lodash",
      labels: [] as string[],
      body: ["```yaml agent", "escalate: not-a-tier", "```"].join("\n"),
    };
    expect(resolveEscalatedModel(issue)).toBeNull();
  });
});

// ── buildSpendAttempts (#2031) ────────────────────────────────────────

describe("buildSpendAttempts", () => {
  const initialResult = {
    tier: "haiku" as const,
    modelId: "claude-haiku-4-5-20251001",
    reason: "lightweight pattern",
    source: "router" as const,
  };
  const escalatedResult = {
    tier: "sonnet" as const,
    modelId: "claude-sonnet-4-6",
    reason: "Escalated from failed run: retrying at declared escalate tier (sonnet)",
    source: "escalate" as const,
  };

  it("returns one attempt entry for a run with no escalation", () => {
    const attempts = buildSpendAttempts("issue-42", initialResult, 0.05);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].sessionId).toBe("issue-42.attempt-1");
    expect(attempts[0].modelId).toBe("claude-haiku-4-5-20251001");
    expect(attempts[0].costUsd).toBe(0.05);
    expect(attempts[0].escalated).toBe(false);
  });

  it("returns two distinct attempt entries when escalation occurred", () => {
    const attempts = buildSpendAttempts("issue-42", initialResult, 0.05, escalatedResult, 0.12);
    expect(attempts).toHaveLength(2);

    const [first, second] = attempts;
    expect(first.sessionId).toBe("issue-42.attempt-1");
    expect(first.modelId).toBe("claude-haiku-4-5-20251001");
    expect(first.costUsd).toBe(0.05);
    expect(first.escalated).toBe(false);

    expect(second.sessionId).toBe("issue-42.attempt-2");
    expect(second.modelId).toBe("claude-sonnet-4-6");
    expect(second.costUsd).toBe(0.12);
    expect(second.escalated).toBe(true);
  });

  it("attempt entries have distinct sessionIds", () => {
    const attempts = buildSpendAttempts("issue-99", initialResult, 0.01, escalatedResult, 0.08);
    const ids = attempts.map((a) => a.sessionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("attempt entries include the source from the model result", () => {
    const attempts = buildSpendAttempts("issue-42", initialResult, 0.05, escalatedResult, 0.12);
    expect(attempts[0].source).toBe("router");
    expect(attempts[1].source).toBe("escalate");
  });
});
