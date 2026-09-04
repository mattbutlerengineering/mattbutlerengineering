#!/usr/bin/env node

/**
 * audit-transient-error.mjs — classify whether a `pnpm audit` failure was a
 * transient network error against the npm registry (retry-worthy) or a real
 * result — a genuine high-severity advisory, or a non-network CLI error —
 * that must fail fast (#4993).
 *
 * `pnpm audit --audit-level=high` already retries transient registry errors
 * internally (2 retries: 10s, then 1min backoff — pnpm's default), but that
 * wasn't enough headroom for a run of `ERR_SOCKET_TIMEOUT`s against
 * `registry.npmjs.org/-/npm/v1/security/audits`: four separate Build job
 * runs hit the identical signature in one night, and it recurred again on
 * PR #4967. Every other CI job (Lint, Typecheck, Test, Architecture Audit,
 * CodeQL, Trivy, …) passed on all affected runs — this is pure connectivity,
 * never a real advisory result.
 *
 * This module is the pure classifier the workflow step's outer retry loop
 * consults, mirroring the pattern in ci-gate-commit-status.mjs's
 * isTransientPublishError(): never retry blind, and never retry a real
 * finding — a genuine CVE advisory (or any other non-network audit failure,
 * e.g. a malformed lockfile) must still fail the Build job on the first
 * attempt, not get masked into a "passing" retry that only succeeds because
 * nothing about the finding changed. See the § Dependencies gotcha in
 * .claude/rules/gotchas.md for the "newly-published transitive CVE" failure
 * mode this deliberately does NOT retry.
 *
 * Usage:
 *   printf '%s' "$OUTPUT" | node scripts/audit-transient-error.mjs
 *   (exit 0 = transient, retry; exit 1 = real result, fail fast)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Output patterns that mean "the request never reached the registry and got
 * a verdict back" — network/transport failures, never a considered audit
 * result.
 */
const TRANSIENT_AUDIT_PATTERNS = [
  /ERR_SOCKET_TIMEOUT/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /socket timeout/i,
  /network timeout/i,
  /getaddrinfo/i,
  /\(HTTP 5\d{2}\)/i,
];

/**
 * Is this `pnpm audit` failure output worth retrying?
 *
 * Fails closed: anything unrecognized — including empty or non-string
 * output, and a real advisory result (which names the vulnerable package,
 * not a socket error) — is treated as non-transient, so a genuine
 * high-severity finding still fails the Build job on the first attempt
 * instead of being retried into a false pass.
 *
 * @param {unknown} output Combined stdout+stderr from the failed
 *   `pnpm audit` invocation.
 * @returns {boolean}
 */
export function isTransientAuditError(output) {
  if (typeof output !== "string" || output === "") return false;
  return TRANSIENT_AUDIT_PATTERNS.some((pattern) => pattern.test(output));
}

/** Read all of stdin, or "" when there is nothing to read. */
function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  // Exit code is the answer, so the workflow can branch on it directly:
  // 0 = retry this, 1 = give up now.
  process.exit(isTransientAuditError(readStdin()) ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
