#!/usr/bin/env node
/**
 * scripts/check-endpoint.mjs
 *
 * Shared HTTP endpoint-liveness probe for the production-feedback,
 * post-deploy-check, and e2e workflows (#3854).
 *
 * Two bugs in the old inline bash silently turned an unreachable endpoint
 * into a reported PASS/healthy:
 *
 *   1. `HTTP_CODE=$(curl ... || echo "000")` doubles the code on a
 *      connection failure. curl already writes its own "000" via `-w`
 *      before exiting non-zero, so the `||` fallback appends a second
 *      "000" -- producing the string "000000", which no downstream guard
 *      (`= "000"`, `-ge 400`) catches.
 *   2. A shared /tmp response file was never truncated between checks, so
 *      a failed request could silently inherit the previous endpoint's
 *      body and satisfy a body-pattern check.
 *
 * fetch() has no analogous "print partial output, then throw" behavior,
 * and every probe reads its own response object -- never a shared file --
 * so neither bug class can recur here.
 *
 * Usage:
 *   node scripts/check-endpoint.mjs <name> <url> [--pattern <substring>] [--timeout <ms>]
 *
 * Prints one JSON line to stdout:
 *   {"name":...,"url":...,"httpCode":0|number,"latencyMs":number,"status":"healthy"|"unreachable"|"error"|"client-error"|"degraded"|"pattern-mismatch"}
 */

import { fileURLToPath } from "node:url";

/** @typedef {"healthy"|"unreachable"|"error"|"client-error"|"degraded"|"pattern-mismatch"} EndpointStatus */

/**
 * Pure classification of a single probe outcome. httpCode 0 means the
 * request never completed (DNS failure, connection refused, timeout).
 *
 * @param {{ httpCode: number, bodyText: string, expectPattern?: string }} probe
 * @returns {EndpointStatus}
 */
export function classifyStatus({ httpCode, bodyText, expectPattern }) {
  if (httpCode === 0) return "unreachable";
  if (httpCode >= 500) return "error";
  if (httpCode >= 400) return "client-error";
  if (isDegradedBody(bodyText)) return "degraded";
  if (expectPattern && !bodyText.includes(expectPattern)) return "pattern-mismatch";
  return "healthy";
}

function isDegradedBody(bodyText) {
  if (!bodyText) return false;
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.status === "degraded";
  } catch {
    return false;
  }
}

/**
 * Performs the actual HTTP probe. Takes fetchFn as a parameter for
 * testability -- no real network calls in unit tests.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ httpCode: number, latencyMs: number, bodyText: string }>}
 */
export async function probeEndpoint(url, { timeoutMs = 15000, fetchFn = fetch } = {}) {
  const start = Date.now();
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    const bodyText = await response.text();
    return { httpCode: response.status, latencyMs: Date.now() - start, bodyText };
  } catch {
    return { httpCode: 0, latencyMs: Date.now() - start, bodyText: "" };
  }
}

/**
 * Probes an endpoint and classifies the result in one call.
 *
 * @param {string} name
 * @param {string} url
 * @param {{ pattern?: string, timeoutMs?: number, fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ name: string, url: string, httpCode: number, latencyMs: number, status: EndpointStatus }>}
 */
export async function checkEndpoint(name, url, { pattern, timeoutMs, fetchFn } = {}) {
  const probe = await probeEndpoint(url, { timeoutMs, fetchFn });
  const status = classifyStatus({ ...probe, expectPattern: pattern });
  return { name, url, httpCode: probe.httpCode, latencyMs: probe.latencyMs, status };
}

function readFlag(args, flag) {
  const idx = args.indexOf(flag);
  return idx === -1 ? undefined : args[idx + 1];
}

// CLI entry point: probe a single endpoint and print its JSON result.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, url, ...rest] = process.argv.slice(2);
  if (!name || !url) {
    console.error(
      "Usage: node scripts/check-endpoint.mjs <name> <url> [--pattern <substring>] [--timeout <ms>]"
    );
    process.exit(1);
  }

  const pattern = readFlag(rest, "--pattern");
  const timeoutArg = readFlag(rest, "--timeout");
  const timeoutMs = timeoutArg ? Number(timeoutArg) : undefined;

  const result = await checkEndpoint(name, url, { pattern, timeoutMs });
  process.stdout.write(JSON.stringify(result) + "\n");
}
