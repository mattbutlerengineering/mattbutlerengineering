import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decideDependabotMerge } from "../dependabot-auto-merge-policy.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CLI = resolve(ROOT, "scripts/dependabot-auto-merge-policy.mjs");

/**
 * Runs the CLI as a real subprocess and parses its single-line JSON stdout —
 * matching how the workflow's `run:` step actually calls this script.
 */
function runCli(args) {
  const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf8" });
  return JSON.parse(stdout);
}

// ---------------------------------------------------------------------------
// decideDependabotMerge — pure policy (architecture.md § 2)
// ---------------------------------------------------------------------------

describe("decideDependabotMerge — the six acceptance cases", () => {
  it("merges actions/setup-node minor (official-actions group)", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "official-actions",
      updateType: "version-update:semver-minor",
      dependencyNames: ["actions/setup-node"],
    });
    expect(result.action).toBe("merge");
  });

  it("merges github/codeql-action/upload-sarif patch (official-actions group)", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "official-actions",
      updateType: "version-update:semver-patch",
      dependencyNames: ["github/codeql-action/upload-sarif"],
    });
    expect(result.action).toBe("merge");
  });

  it("requires manual for hadolint/hadolint-action minor (third-party, no group)", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "",
      updateType: "version-update:semver-minor",
      dependencyNames: ["hadolint/hadolint-action"],
    });
    expect(result.action).toBe("manual");
    expect(result.reason).toMatch(/third-party GitHub Action/);
  });

  it("requires manual for any semver-major, regardless of group", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "official-actions",
      updateType: "version-update:semver-major",
      dependencyNames: ["actions/setup-node"],
    });
    expect(result.action).toBe("manual");
    expect(result.reason).toMatch(/major/);
  });

  it("merges @types/node patch under production dependencies (types group)", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "types",
      updateType: "version-update:semver-patch",
      dependencyNames: ["@types/node"],
    });
    expect(result.action).toBe("merge");
  });

  it("requires manual for a production npm dependency (no group)", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "",
      updateType: "version-update:semver-minor",
      dependencyNames: ["fastify"],
    });
    expect(result.action).toBe("manual");
    expect(result.reason).toMatch(/production dependency/);
  });
});

describe("decideDependabotMerge — rule order", () => {
  it("semver-major beats group === dev-deps (rule 1 before rule 2)", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "dev-deps",
      updateType: "version-update:semver-major",
      dependencyNames: ["vitest"],
    });
    expect(result.action).toBe("manual");
    expect(result.reason).toMatch(/major/);
  });

  it("merges group === dev-deps unchanged (existing behavior)", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "dev-deps",
      updateType: "version-update:semver-minor",
      dependencyNames: ["vitest"],
    });
    expect(result.action).toBe("merge");
  });
});

describe("decideDependabotMerge — fail-closed cases", () => {
  it("requires manual for an unknown group", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "some-unrecognized-group",
      updateType: "version-update:semver-patch",
      dependencyNames: ["left-pad"],
    });
    expect(result.action).toBe("manual");
  });

  it("requires manual for an empty group (unset)", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "",
      updateType: "version-update:semver-patch",
      dependencyNames: ["left-pad"],
    });
    expect(result.action).toBe("manual");
  });

  it("requires manual when dependencyNames is empty, even for official-actions", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "official-actions",
      updateType: "version-update:semver-minor",
      dependencyNames: [],
    });
    expect(result.action).toBe("manual");
  });

  it("requires manual for official-actions when a name fails the owner-prefix check", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "official-actions",
      updateType: "version-update:semver-minor",
      dependencyNames: ["actions/setup-node", "hadolint/hadolint-action"],
    });
    expect(result.action).toBe("manual");
  });

  it("requires manual for types when a name fails the @types/ prefix check", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "types",
      updateType: "version-update:semver-patch",
      dependencyNames: ["@types/node", "fastify"],
    });
    expect(result.action).toBe("manual");
  });
});

describe("decideDependabotMerge — npm-vs-non-npm reason wording (rule 5)", () => {
  it("describes an unmatched npm ecosystem update as a production dependency", () => {
    const result = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "",
      updateType: "version-update:semver-minor",
      dependencyNames: ["fastify"],
    });
    expect(result.reason).toMatch(/production dependency/);
    expect(result.reason).not.toMatch(/GitHub Action/);
  });

  it("describes an unmatched github-actions ecosystem update as a third-party action, not a production dependency", () => {
    const result = decideDependabotMerge({
      ecosystem: "github-actions",
      group: "",
      updateType: "version-update:semver-minor",
      dependencyNames: ["hadolint/hadolint-action"],
    });
    expect(result.reason).toMatch(/third-party GitHub Action/);
    expect(result.reason).not.toMatch(/production dependency/);
  });
});

// ---------------------------------------------------------------------------
// CLI — `decide` subcommand (mirrors merge-queue-eligibility.mjs's main())
// ---------------------------------------------------------------------------

describe("CLI decide subcommand", () => {
  it("prints the decision JSON for a merge case", () => {
    const result = runCli([
      "decide",
      "--ecosystem",
      "github-actions",
      "--group",
      "official-actions",
      "--update-type",
      "version-update:semver-minor",
      "--dependency-names",
      "actions/setup-node",
    ]);
    expect(result).toEqual({ action: "merge", reason: expect.any(String) });
  });

  it("prints the decision JSON for a manual case and exits 0 (not a red step)", () => {
    const result = runCli([
      "decide",
      "--ecosystem",
      "npm_and_yarn",
      "--group",
      "",
      "--update-type",
      "version-update:semver-minor",
      "--dependency-names",
      "fastify",
    ]);
    expect(result.action).toBe("manual");
  });

  it("splits comma-separated --dependency-names and merges only when every name matches", () => {
    const result = runCli([
      "decide",
      "--ecosystem",
      "github-actions",
      "--group",
      "official-actions",
      "--update-type",
      "version-update:semver-patch",
      "--dependency-names",
      "actions/setup-node,github/codeql-action/upload-sarif",
    ]);
    expect(result.action).toBe("merge");
  });
});
