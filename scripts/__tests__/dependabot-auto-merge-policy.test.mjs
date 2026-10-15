import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decideDependabotMerge } from "../dependabot-auto-merge-policy.mjs";

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../dependabot-auto-merge-policy.mjs"
);

const MINOR = "version-update:semver-minor";
const PATCH = "version-update:semver-patch";
const MAJOR = "version-update:semver-major";

describe("decideDependabotMerge: acceptance cases (#6650)", () => {
  it("actions/setup-node minor -> merge", () => {
    const d = decideDependabotMerge({
      ecosystem: "github_actions",
      group: "official-actions",
      updateType: MINOR,
      dependencyNames: ["actions/setup-node"],
    });
    expect(d.action).toBe("merge");
  });

  it("github/codeql-action/upload-sarif patch -> merge", () => {
    const d = decideDependabotMerge({
      ecosystem: "github_actions",
      group: "official-actions",
      updateType: PATCH,
      dependencyNames: ["github/codeql-action/upload-sarif"],
    });
    expect(d.action).toBe("merge");
  });

  it("hadolint/hadolint-action minor (ungrouped) -> manual, not called a production dependency", () => {
    const d = decideDependabotMerge({
      ecosystem: "github_actions",
      group: "",
      updateType: MINOR,
      dependencyNames: ["hadolint/hadolint-action"],
    });
    expect(d.action).toBe("manual");
    expect(d.reason).toMatch(/third-party GitHub Action/);
    expect(d.reason).not.toMatch(/production dependency/);
  });

  it("any semver-major -> manual, even in an auto-mergeable group", () => {
    for (const [ecosystem, group, name] of [
      ["github_actions", "official-actions", "actions/checkout"],
      ["npm_and_yarn", "types", "@types/node"],
      ["npm_and_yarn", "dev-deps", "eslint"],
    ]) {
      const d = decideDependabotMerge({
        ecosystem,
        group,
        updateType: MAJOR,
        dependencyNames: [name],
      });
      expect(d.action).toBe("manual");
    }
  });

  it("@types/node patch in the types group (production dependencies block) -> merge", () => {
    const d = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "types",
      updateType: PATCH,
      dependencyNames: ["@types/node"],
    });
    expect(d.action).toBe("merge");
  });

  it("production npm dep -> manual, described as a production dependency", () => {
    const d = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "production-deps",
      updateType: MINOR,
      dependencyNames: ["fastify"],
    });
    expect(d.action).toBe("manual");
    expect(d.reason).toMatch(/production dependency/);
  });

  it("dev-deps minor -> merge (existing behavior preserved)", () => {
    const d = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "dev-deps",
      updateType: MINOR,
      dependencyNames: ["eslint", "prettier"],
    });
    expect(d.action).toBe("merge");
  });
});

describe("decideDependabotMerge: fail closed", () => {
  const base = {
    ecosystem: "github_actions",
    group: "official-actions",
    updateType: MINOR,
    dependencyNames: ["actions/checkout"],
  };

  it("unknown or missing group -> manual", () => {
    expect(decideDependabotMerge({ ...base, group: "mystery" }).action).toBe("manual");
    expect(decideDependabotMerge({ ...base, group: undefined }).action).toBe("manual");
  });

  it("empty or missing dependency names -> manual", () => {
    expect(decideDependabotMerge({ ...base, dependencyNames: [] }).action).toBe("manual");
    expect(decideDependabotMerge({ ...base, dependencyNames: undefined }).action).toBe("manual");
  });

  it("official-actions group containing a non-official name -> manual", () => {
    const d = decideDependabotMerge({
      ...base,
      dependencyNames: ["actions/checkout", "hadolint/hadolint-action"],
    });
    expect(d.action).toBe("manual");
  });

  it("owner prefix must match exactly (actions-evil/x, not actions/)", () => {
    expect(decideDependabotMerge({ ...base, dependencyNames: ["actions-evil/x"] }).action).toBe(
      "manual"
    );
  });

  it("types group containing a non-@types name -> manual", () => {
    const d = decideDependabotMerge({
      ecosystem: "npm_and_yarn",
      group: "types",
      updateType: PATCH,
      dependencyNames: ["@types/node", "left-pad"],
    });
    expect(d.action).toBe("manual");
  });

  it("missing update type -> manual", () => {
    expect(decideDependabotMerge({ ...base, updateType: "" }).action).toBe("manual");
  });
});

describe("decide CLI", () => {
  const run = (...args) =>
    JSON.parse(execFileSync("node", [SCRIPT, "decide", ...args], { encoding: "utf8" }));

  it("prints the merge decision as JSON and exits 0", () => {
    const out = run(
      "--ecosystem",
      "github_actions",
      "--group",
      "official-actions",
      "--update-type",
      MINOR,
      "--dependency-names",
      "actions/setup-node"
    );
    expect(out.action).toBe("merge");
  });

  it("prints manual (exit 0, not a red step) for an ungrouped update with empty group", () => {
    const out = run(
      "--ecosystem",
      "github_actions",
      "--group",
      "",
      "--update-type",
      MINOR,
      "--dependency-names",
      "hadolint/hadolint-action"
    );
    expect(out.action).toBe("manual");
  });

  it("splits comma-separated names", () => {
    const out = run(
      "--ecosystem",
      "npm_and_yarn",
      "--group",
      "types",
      "--update-type",
      PATCH,
      "--dependency-names",
      "@types/node, @types/react"
    );
    expect(out.action).toBe("merge");
  });
});
