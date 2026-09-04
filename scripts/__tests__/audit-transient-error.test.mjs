import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isTransientAuditError } from "../audit-transient-error.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CI_WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const PACKAGE_JSON = readFileSync(resolve(ROOT, "package.json"), "utf8");

describe("isTransientAuditError (#4993)", () => {
  it("treats the observed ERR_SOCKET_TIMEOUT failure as transient", () => {
    // Real signature observed across 4+ Build job runs in one night, and
    // again on PR #4967.
    const output = [
      "WARN  post https://registry.npmjs.org/-/npm/v1/security/audits error (ERR_SOCKET_TIMEOUT). Will retry in 10 seconds. 2 retries left.",
      "WARN  post https://registry.npmjs.org/-/npm/v1/security/audits error (ERR_SOCKET_TIMEOUT). Will retry in 1 minute. 1 retries left.",
      "ERR_SOCKET_TIMEOUT  request to https://registry.npmjs.org/-/npm/v1/security/audits failed, reason: Socket timeout",
    ].join("\n");
    expect(isTransientAuditError(output)).toBe(true);
  });

  it("treats other network-transport failures as transient", () => {
    for (const message of [
      "ETIMEDOUT",
      "connect ECONNRESET",
      "connect ECONNREFUSED 104.16.0.35:443",
      "getaddrinfo EAI_AGAIN registry.npmjs.org",
      "request to https://registry.npmjs.org/ failed: socket timeout",
      "gh: Server Error (HTTP 503)",
    ]) {
      expect(isTransientAuditError(message)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isTransientAuditError("err_socket_timeout")).toBe(true);
  });

  it("never treats a real high-severity advisory result as transient", () => {
    // Shape of a genuine `pnpm audit --audit-level=high` finding — names the
    // vulnerable package, never a socket/network error. This is the class
    // documented in gotchas.md § Dependencies ("newly-published transitive
    // CVE") that must keep failing the Build job on the first attempt.
    const advisory = [
      "┌─────────────────────────────┬────────────────────────────────────────────────────────────┐",
      "│ high             │ Prototype Pollution in some-package                                     │",
      "├─────────────────────────────┼────────────────────────────────────────────────────────────┤",
      "│ Package          │ some-package                                                             │",
      "│ Vulnerable versions │ <1.2.3                                                                │",
      "│ Patched versions │ >=1.2.3                                                                  │",
      "└─────────────────────────────┴────────────────────────────────────────────────────────────┘",
      "1 vulnerabilities found",
    ].join("\n");
    expect(isTransientAuditError(advisory)).toBe(false);
  });

  it("fails closed on empty or non-string output — unknown is not transient", () => {
    for (const value of ["", null, undefined, 42]) {
      expect(isTransientAuditError(value)).toBe(false);
    }
  });
});

describe("package.json — pnpm audit is no longer inside repo-audit's chain (#4993)", () => {
  const scripts = JSON.parse(PACKAGE_JSON).scripts;

  it("repo-audit no longer runs `pnpm audit` directly", () => {
    expect(scripts["repo-audit"]).not.toContain("pnpm audit");
  });

  it("exposes a standalone audit:security script", () => {
    expect(scripts["audit:security"]).toContain("pnpm audit --audit-level=high");
  });
});

describe("ci.yml Build job — network-resilient pnpm audit step (#4993)", () => {
  it("runs pnpm audit in its own step, wrapped with an outer retry loop", () => {
    expect(CI_WORKFLOW).toContain("pnpm run audit:security");
  });

  it("classifies retry-worthiness via the pure audit-transient-error.mjs module", () => {
    expect(CI_WORKFLOW).toContain("scripts/audit-transient-error.mjs");
  });
});
