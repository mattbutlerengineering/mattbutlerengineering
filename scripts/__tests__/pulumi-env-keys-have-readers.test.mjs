/**
 * Every env var the DigitalOcean app spec declares must be read by some
 * runtime code. The spec set `CORS_ORIGIN` on all three services while
 * service-bootstrap reads `CORS_ORIGINS`, so the deployed value was silently
 * discarded (backlog seed: "Reconcile CORS_ORIGIN ..."). Configuration that
 * ships and never takes effect is invisible while the fallback happens to be
 * right, so this pins the class rather than the one key.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PULUMI_INDEX = "infrastructure/pulumi/index.ts";
const READER_DIRS = ["services", "packages", "infrastructure/migrate"];
const SOURCE_FILE = /\.(ts|tsx|mjs|js|sh)$|Dockerfile$/;
const TEST_FILE = /\.test\.|__tests__|\/e2e\//;

/** Keys passed to extraEnv("KEY", ...) or secretEnv("KEY", ...). */
function declaredEnvKeys(source) {
  return [...source.matchAll(/\b(?:extraEnv|secretEnv)\(\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]);
}

function runtimeSources() {
  const files = execFileSync("git", ["ls-files", "--", ...READER_DIRS], {
    cwd: ROOT,
    encoding: "utf-8",
  })
    .split("\n")
    .filter((f) => SOURCE_FILE.test(f) && !TEST_FILE.test(f));
  return files.map((f) => readFileSync(join(ROOT, f), "utf-8")).join("\n");
}

describe("declaredEnvKeys", () => {
  it("finds plain and secret keys", () => {
    const src = 'extraEnv("NODE_ENV", "production"),\n  secretEnv("DATABASE_URL", url),';
    expect(declaredEnvKeys(src)).toEqual(["NODE_ENV", "DATABASE_URL"]);
  });
});

describe("the DigitalOcean app spec", () => {
  it("declares only env vars that runtime code reads", () => {
    const keys = [...new Set(declaredEnvKeys(readFileSync(join(ROOT, PULUMI_INDEX), "utf-8")))];
    expect(keys.length).toBeGreaterThan(5);
    const sources = runtimeSources();
    const unread = keys.filter((key) => !new RegExp(`\\b${key}\\b`).test(sources));
    expect(unread).toEqual([]);
  });
});
