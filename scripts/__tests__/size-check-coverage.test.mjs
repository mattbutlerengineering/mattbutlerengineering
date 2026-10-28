import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A package with a `size-limit` config but no `size:check` script is skipped by
 * `turbo run size:check`, so CI never enforces its budgets (#7853: rialto's
 * fr-CA locale went 4 B over budget unnoticed).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function packageJsonsWithSizeLimit() {
  const out = execFileSync(
    "git",
    ["ls-files", "--", "apps/*/package.json", "packages/*/package.json", "services/*/package.json"],
    {
      cwd: ROOT,
      encoding: "utf8",
    }
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((rel) => readJson(rel)["size-limit"] !== undefined);
}

describe("size:check coverage (#7853)", () => {
  it("packages/rialto defines a size:check script running size-limit", () => {
    const pkg = readJson("packages/rialto/package.json");
    expect(pkg["size-limit"]).toBeDefined();
    expect(pkg.scripts["size:check"]).toBe("size-limit");
  });

  it("every package with a size-limit config has a size:check script", () => {
    const missing = packageJsonsWithSizeLimit().filter(
      (rel) => !readJson(rel).scripts?.["size:check"]
    );
    expect(missing).toEqual([]);
  });
});
