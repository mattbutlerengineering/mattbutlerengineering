import { describe, it, expect } from "vitest";
import { resolveIssueModel } from "../resolve-issue-model.js";

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
