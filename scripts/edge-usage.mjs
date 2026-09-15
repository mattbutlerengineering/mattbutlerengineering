#!/usr/bin/env node

/**
 * Edge usage — requests per route and pathname over a trailing window, read
 * from the `edge_requests` Analytics Engine dataset the edge router writes
 * (infrastructure/worker/edge-router.js → analytics-schema.js).
 *
 * Usage: node scripts/edge-usage.mjs [--days <1..90>] [--route <name>]
 *
 * Required env vars (same names as scripts/resource-audit.mjs):
 *   CLOUDFLARE_API_TOKEN   — CF API token with Account · Account Analytics · Read.
 *                            This is NOT the scope MBE_CLOUDFLARE_API_TOKEN is
 *                            documented with (docs/SECRETS.md); see the runbook.
 *   CLOUDFLARE_ACCOUNT_ID  — CF account ID (not a credential)
 *
 * Counts are SUM(_sample_interval), never COUNT(): Analytics Engine samples
 * under load and the sample interval is the weight that restores the total.
 * Edge counts undercount real usage — an SPA navigation never reaches the
 * Worker. Both caveats, and what "0 rows" means in the first hours after a
 * deploy, are in docs/runbooks/edge-usage.md.
 *
 * The API takes raw SQL, so the --days / --route allowlist below IS the
 * injection boundary: values are interpolated only after validation.
 */

import { fileURLToPath } from "node:url";
import {
  EDGE_REQUESTS_COLUMNS,
  EDGE_REQUESTS_DATASET,
} from "../infrastructure/worker/analytics-schema.js";

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90; // ≈ Analytics Engine retention (three months)
export const ROUTE_PATTERN = /^[a-z][a-z0-9_-]*$/;
export const ZERO_ROWS_MESSAGE = "0 rows — see docs/runbooks/edge-usage.md";
export const SCOPE_HINT =
  "the token needs the Account Analytics Read scope (Cloudflare dashboard: Account · Account Analytics · Read)";

export const USAGE = `Usage: node scripts/edge-usage.mjs [--days <1..${MAX_DAYS}>] [--route <name>]

Requests per route and pathname over a trailing window, read from the
${EDGE_REQUESTS_DATASET} Analytics Engine dataset. Needs CLOUDFLARE_API_TOKEN
(Account Analytics Read) and CLOUDFLARE_ACCOUNT_ID. See docs/runbooks/edge-usage.md.

  --days <n>      integer 1..${MAX_DAYS} (default ${DEFAULT_DAYS})
  --route <name>  restrict to one edge route (e.g. rialto); must match ${ROUTE_PATTERN}`;

// ── Validation (the injection boundary) ──────────────────────────────

export function isValidDays(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_DAYS;
}

export function isValidRoute(value) {
  return typeof value === "string" && ROUTE_PATTERN.test(value);
}

/**
 * Hand-rolled flag parser (cf. record-audit-check.mjs). Returns
 * `{ days, route, error }`; on any usage error `days` and `route` are null so
 * a bad value can never reach buildUsageQuery by accident.
 *
 * @param {string[]} argv
 * @returns {{ days: number | null, route: string | null, error: string | null }}
 */
export function parseArgs(argv) {
  const usageError = (error) => ({ days: null, route: null, error });
  let days = DEFAULT_DAYS;
  let route = null;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (flag === "--days") {
      const parsed = /^\d+$/.test(value ?? "") ? Number(value) : NaN;
      if (!isValidDays(parsed)) {
        return usageError(`Invalid --days "${value}": expected an integer from 1 to ${MAX_DAYS}`);
      }
      days = parsed;
      i += 1;
    } else if (flag === "--route") {
      if (!isValidRoute(value)) {
        return usageError(`Invalid --route "${value}": expected a name matching ${ROUTE_PATTERN}`);
      }
      route = value;
      i += 1;
    } else {
      return usageError(`Unknown argument "${flag}"`);
    }
  }

  return { days, route, error: null };
}

// ── Query ────────────────────────────────────────────────────────────

/**
 * Build the SQL. Column names come from the schema module, so the reader can
 * never disagree with the writer about which blob holds the pathname.
 *
 * @param {{ days?: number, route?: string | null }} [options]
 * @returns {string}
 */
export function buildUsageQuery({ days = DEFAULT_DAYS, route = null } = {}) {
  if (!isValidDays(days)) {
    throw new Error(
      `Refusing to build a query with days=${days}: expected an integer 1..${MAX_DAYS}`
    );
  }
  if (route !== null && !isValidRoute(route)) {
    throw new Error(`Refusing to build a query with route="${route}": must match ${ROUTE_PATTERN}`);
  }

  const { route: routeColumn, pathname: pathnameColumn } = EDGE_REQUESTS_COLUMNS;
  const routeFilter = route === null ? "" : ` AND ${routeColumn} = '${route}'`;

  return [
    `SELECT ${routeColumn} AS route, ${pathnameColumn} AS pathname, SUM(_sample_interval) AS requests`,
    `FROM ${EDGE_REQUESTS_DATASET}`,
    `WHERE timestamp > NOW() - INTERVAL '${days}' DAY${routeFilter}`,
    "GROUP BY route, pathname",
    "ORDER BY requests DESC",
    "LIMIT 100",
    "FORMAT JSONEachRow",
  ].join("\n");
}

export function sqlApiUrl(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;
}

/** Split a JSONEachRow body into objects; an empty body is zero rows. */
export function parseRows(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(
          `Analytics Engine SQL API returned a non-JSON line (${index + 1}): ${line}`
        );
      }
    });
}

/**
 * POST the SQL to the Analytics Engine SQL API and return the parsed rows.
 *
 * @param {{ fetchImpl: typeof fetch, accountId: string, token: string, sql: string }} params
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function queryEdgeUsage({ fetchImpl, accountId, token, sql }) {
  const response = await fetchImpl(sqlApiUrl(accountId), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: sql,
  });
  const text = await response.text();

  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403 ? ` — ${SCOPE_HINT}` : "";
    throw new Error(`Analytics Engine SQL API failed: ${response.status} ${text}${hint}`);
  }

  return parseRows(text);
}

// ── Output ───────────────────────────────────────────────────────────

const COLUMNS = ["route", "pathname", "requests"];

export function formatRows(rows) {
  const table = [COLUMNS, ...rows.map((row) => COLUMNS.map((col) => String(row[col] ?? "")))];
  const widths = COLUMNS.map((_, col) => Math.max(...table.map((cells) => cells[col].length)));
  return table
    .map((cells) =>
      cells
        .map((cell, col) => cell.padEnd(widths[col]))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

// ── Entry ────────────────────────────────────────────────────────────

/** Same message text as scripts/resource-audit.mjs, reading the injected env. */
function requireEnv(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Wire env, args, the call and printing. RETURNS the exit code — the entry
 * guard below is the only place process.exit is called, so the missing-env
 * and usage paths are unit-testable without spawning.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {string[]} [deps.argv]
 * @param {{ write: (chunk: string) => unknown }} [deps.stdout]
 * @param {{ write: (chunk: string) => unknown }} [deps.stderr]
 * @returns {Promise<0 | 1>}
 */
export async function main(env, deps = {}) {
  const { fetchImpl = fetch, argv = [], stdout = process.stdout, stderr = process.stderr } = deps;

  const args = parseArgs(argv);
  if (args.error) {
    stderr.write(`${args.error}\n\n${USAGE}\n`);
    return 1;
  }

  try {
    const token = requireEnv(env, "CLOUDFLARE_API_TOKEN");
    const accountId = requireEnv(env, "CLOUDFLARE_ACCOUNT_ID");
    const sql = buildUsageQuery({ days: args.days, route: args.route });
    const rows = await queryEdgeUsage({ fetchImpl, accountId, token, sql });

    if (rows.length === 0) {
      stdout.write(`${ZERO_ROWS_MESSAGE}\n`);
      return 0;
    }

    const scope = args.route === null ? "" : `, route ${args.route}`;
    stdout.write(
      `${formatRows(rows)}\n\n${rows.length} row(s) over the last ${args.days} day(s)${scope}; requests = SUM(_sample_interval)\n`
    );
    return 0;
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env, { argv: process.argv.slice(2) }).then((code) => process.exit(code));
}
