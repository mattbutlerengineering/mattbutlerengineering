#!/usr/bin/env node
/**
 * health-alert-summary.mjs — builds the issue title/summary for
 * `.github/workflows/synthetic-monitoring.yml`'s "Create health alert issue
 * (cont.)" step (#4359).
 *
 * Bug: `/health/system`'s coarse (unauthenticated) response only carries
 * `{status}` per subsystem — no `.checks` map (that requires a valid
 * `X-Audit-Token`/Bearer credential; see `AUDIT_TOKEN` in the workflow).
 * The old inline jq read `.checks` only, so a degraded `services` or
 * `static_sites` subsystem with no `.checks` produced an empty SUMMARY and
 * an empty, useless title ("System health degraded: ", issue #4359).
 *
 * `buildHealthAlertSummary()` is the pure decision, unit-tested without
 * network in `scripts/__tests__/health-alert-summary.test.mjs`. The CLI
 * below is a thin, dependency-free caller the workflow invokes with the
 * health-check JSON on stdin, mirroring `scripts/merge-queue-eligibility.mjs`
 * (pure function + `console.log(JSON.stringify(...))`, consumed via `jq` in
 * the calling workflow step).
 *
 * Usage:
 *   echo "$HEALTH_RESPONSE" | node scripts/lib/health-alert-summary.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_TITLE_LENGTH = 256;
const OK_STATUSES = new Set(["ok", "healthy"]);

/**
 * Comma-joined list of check names whose status isn't "ok", extracted from
 * a subsystem's `.checks` map. Returns "" when `.checks` is absent (coarse,
 * unauthenticated response) or empty.
 *
 * @param {{ checks?: Record<string, { status?: string }> }} [subsystem]
 * @returns {string}
 */
function extractFailedChecks(subsystem) {
  const checks = subsystem?.checks;
  if (!checks || typeof checks !== "object") return "";
  return Object.entries(checks)
    .filter(([, value]) => value?.status !== "ok")
    .map(([key]) => key)
    .join(", ");
}

/**
 * Build the health-alert issue title/summary from a parsed `/health/system`
 * response. When per-check detail (`.checks`) is unavailable for a
 * degraded/unhealthy `services` or `static_sites` subsystem, falls back to
 * reporting the subsystem-level `.status` instead of silently omitting it.
 *
 * @param {object} healthResponseJson - parsed `/health/system` JSON body.
 * @returns {{
 *   title: string, summary: string,
 *   failedServices: string, failedSites: string,
 *   ciStatus: string, deployStatus: string,
 * }}
 */
export function buildHealthAlertSummary(healthResponseJson) {
  const subsystems = healthResponseJson?.subsystems ?? {};
  const services = subsystems.services ?? {};
  const staticSites = subsystems.static_sites ?? {};
  const ci = subsystems.ci ?? {};
  const deploys = subsystems.deploys ?? {};

  const failedServices = extractFailedChecks(services);
  const failedSites = extractFailedChecks(staticSites);
  const ciStatus = ci.status ?? "unknown";
  const deployStatus = deploys.status ?? "unknown";
  const servicesStatus = services.status ?? "unknown";
  const staticSitesStatus = staticSites.status ?? "unknown";

  let summary = "";
  if (failedServices) {
    summary += `Services down: ${failedServices}. `;
  } else if (!OK_STATUSES.has(servicesStatus)) {
    summary += `Services: ${servicesStatus} (no per-check detail — AUDIT_TOKEN not configured or check data unavailable). `;
  }
  if (failedSites) {
    summary += `Static sites down: ${failedSites}. `;
  } else if (!OK_STATUSES.has(staticSitesStatus)) {
    summary += `Static sites: ${staticSitesStatus} (no per-check detail — AUDIT_TOKEN not configured or check data unavailable). `;
  }
  if (ciStatus !== "healthy") {
    summary += `CI: ${ciStatus}. `;
  }
  if (deployStatus !== "healthy") {
    summary += `Deploys: ${deployStatus}. `;
  }

  const status = healthResponseJson?.status ?? "unknown";
  const title = `System health ${status}: ${summary}`.slice(0, MAX_TITLE_LENGTH);

  return { title, summary, failedServices, failedSites, ciStatus, deployStatus };
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
  const raw = readStdin();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[health-alert-summary] failed to parse stdin as JSON: ${err.message}`);
    process.exit(1);
  }
  console.log(JSON.stringify(buildHealthAlertSummary(parsed)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
