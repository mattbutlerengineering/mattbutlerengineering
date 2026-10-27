/**
 * Tests for scripts/api-failures.mjs — the weekly /api failure and latency
 * report over the edge_requests Analytics Engine dataset (#7545).
 *
 * The SQL API and `gh` are injected (vi.fn()): no real query or issue write
 * runs here. Column names are derived from analytics-schema.js, never literals.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDGE_REQUESTS_COLUMNS,
  EDGE_REQUESTS_DATASET,
} from "../../infrastructure/worker/analytics-schema.js";
import {
  THRESHOLDS,
  MAX_NEW_ISSUES,
  QUERY_ROW_LIMIT,
  normalizePath,
  buildFailuresQuery,
  aggregate,
  classify,
  markerFor,
  areaLabelFor,
  buildIssueTitle,
  buildIssueBody,
  planActions,
  main,
} from "../api-failures.mjs";
import { findScheduledWorkflows } from "../scheduled-workflow-health.mjs";

const API = "/api";
const ENV = { CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acct" };

const sqlRow = (method, pathname, status, requests, p95 = 100) => ({
  method,
  pathname,
  status,
  requests,
  p95,
});

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n");

function capture() {
  const chunks = [];
  return { write: (c) => chunks.push(String(c)), text: () => chunks.join("") };
}

describe("normalizePath", () => {
  it("collapses UUIDs, numeric ids and long mixed tokens to :id", () => {
    expect(normalizePath(`${API}/v1/reservations/3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b`)).toBe(
      `${API}/v1/reservations/:id`
    );
    expect(normalizePath(`${API}/v1/users/12345/profile`)).toBe(`${API}/v1/users/:id/profile`);
    expect(normalizePath(`${API}/venues/res_9fA3kLq2Zx81/tables`)).toBe(`${API}/venues/:id/tables`);
  });

  it("keeps ordinary words and drops a trailing slash", () => {
    expect(normalizePath(`${API}/v1/reservations/availability/`)).toBe(
      `${API}/v1/reservations/availability`
    );
    expect(normalizePath(`${API}/v1/users/me`)).toBe(`${API}/v1/users/me`);
  });
});

describe("buildFailuresQuery", () => {
  it("reads the schema columns, filters /api/ and weights by _sample_interval", () => {
    const sql = buildFailuresQuery();
    const c = EDGE_REQUESTS_COLUMNS;
    expect(sql).toContain(`FROM ${EDGE_REQUESTS_DATASET}`);
    expect(sql).toContain(`${c.method} AS method`);
    expect(sql).toContain(`${c.pathname} AS pathname`);
    expect(sql).toContain(`${c.status} AS status`);
    expect(sql).toContain(`quantileExactWeighted(0.95)(${c.elapsedMs}, _sample_interval)`);
    expect(sql).toContain("SUM(_sample_interval)");
    expect(sql).toContain(`${c.pathname} LIKE '${API}/%'`);
    expect(sql).toContain("INTERVAL '7' DAY");
    expect(sql).toContain("FORMAT JSONEachRow");
  });
});

describe("aggregate", () => {
  it("merges rows sharing a normalized path and counts 5xx / 4xx", () => {
    const groups = aggregate([
      sqlRow("GET", `${API}/v1/reservations/111`, 200, 90),
      sqlRow("GET", `${API}/v1/reservations/222`, 500, 10),
      sqlRow("POST", `${API}/v1/reservations`, 400, 5),
    ]);
    const get = groups.find((g) => g.method === "GET");
    expect(get).toMatchObject({
      path: `${API}/v1/reservations/:id`,
      total: 100,
      count5xx: 10,
      count4xx: 0,
    });
    expect(get.rate5xx).toBeCloseTo(0.1);
    expect(groups.find((g) => g.method === "POST").count4xx).toBe(5);
  });

  it("excludes 401 and 404 from the 4xx count on reads only", () => {
    const [get] = aggregate([
      sqlRow("GET", `${API}/v1/users/me`, 401, 40),
      sqlRow("GET", `${API}/v1/users/me`, 404, 10),
      sqlRow("GET", `${API}/v1/users/me`, 422, 5),
      sqlRow("GET", `${API}/v1/users/me`, 200, 45),
    ]);
    expect(get.count4xx).toBe(5);
    const [post] = aggregate([
      sqlRow("POST", `${API}/v1/users`, 401, 4),
      sqlRow("POST", `${API}/v1/users`, 404, 1),
    ]);
    expect(post.count4xx).toBe(5);
  });

  it("reports the request-weighted 95th percentile of the row p95s and top statuses", () => {
    const [g] = aggregate([
      sqlRow("GET", `${API}/gen/runs`, 200, 95, 100),
      sqlRow("GET", `${API}/gen/runs/9`, 200, 5, 5000),
    ]);
    expect(g.p95).toBe(100);
    const [slow] = aggregate([
      sqlRow("GET", `${API}/gen/runs`, 200, 90, 100),
      sqlRow("GET", `${API}/gen/runs`, 504, 10, 5000),
    ]);
    expect(slow.p95).toBe(5000);
    expect(slow.topStatuses[0]).toEqual({ status: 200, count: 90 });
  });
});

describe("classify", () => {
  const base = { total: 1000, count5xx: 0, count4xx: 0, p95: 100 };

  it("returns no reasons for a healthy endpoint", () => {
    expect(classify(base)).toEqual([]);
  });

  it("flags 5xx at >= 1% with >= 20 requests", () => {
    expect(classify({ ...base, total: 100, count5xx: 1 })).toHaveLength(1);
    expect(classify({ ...base, total: 19, count5xx: 19 })).toEqual([]);
    expect(classify({ ...base, total: 20, count5xx: 1 })[0]).toMatch(/5xx/);
    expect(classify({ ...base, total: 1000, count5xx: 9 })).toEqual([]);
  });

  it("flags 4xx at >= 10% with >= 50 requests", () => {
    expect(classify({ ...base, total: 50, count4xx: 5 })[0]).toMatch(/4xx/);
    expect(classify({ ...base, total: 49, count4xx: 49 })).toEqual([]);
    expect(classify({ ...base, total: 100, count4xx: 9 })).toEqual([]);
  });

  it("flags p95 >= 2000 ms", () => {
    expect(classify({ ...base, p95: 2000 })[0]).toMatch(/p95/);
    expect(classify({ ...base, p95: 1999 })).toEqual([]);
  });

  it("exposes the thresholds as named constants", () => {
    expect(THRESHOLDS).toMatchObject({
      rate5xx: 0.01,
      min5xx: 20,
      rate4xx: 0.1,
      min4xx: 50,
      p95Ms: 2000,
    });
  });
});

describe("issue content", () => {
  const group = {
    method: "GET",
    path: `${API}/v1/reservations/:id`,
    total: 200,
    count5xx: 10,
    count4xx: 0,
    rate5xx: 0.05,
    rate4xx: 0,
    p95: 300,
    topStatuses: [{ status: 200, count: 190 }],
  };

  it("builds the marker, title, area label and body", () => {
    expect(markerFor(group)).toBe("<!-- api-failures:GET /api/v1/reservations/:id -->");
    expect(buildIssueTitle(group, ["5xx rate 5.0% (10/200)"])).toBe(
      "api-failures: GET /api/v1/reservations/:id — 5xx rate 5.0% (10/200)"
    );
    expect(areaLabelFor(`${API}/v1/reservations/:id`)).toBe("area:reservations");
    expect(areaLabelFor(`${API}/v1/users/me`)).toBe("area:users");
    expect(areaLabelFor(`${API}/gen/runs`)).toBe("area:agent");
    expect(areaLabelFor(`${API}/v1/venues/:id/tables`)).toBe("area:reservations");
    expect(areaLabelFor(`${API}/health`)).toBe("area:reservations");
    expect(buildIssueBody(group, [], 7)).not.toMatch(/may be low/);
    expect(buildIssueBody(group, [], 7, true)).toMatch(/may be low/);
    const body = buildIssueBody(group, ["5xx rate 5.0% (10/200)"], 7);
    expect(body).toContain(markerFor(group));
    expect(body).toContain("7 days");
    expect(body).toContain("200");
    expect(body).toContain("p95");
  });
});

describe("planActions", () => {
  const breaching = (n) => ({
    method: "GET",
    path: `${API}/v1/reservations/r${n}`,
    total: 100,
    count5xx: 50,
    count4xx: 0,
    rate5xx: 0.5,
    rate4xx: 0,
    p95: 100,
    topStatuses: [],
  });

  it("skips healthy endpoints", () => {
    const healthy = { ...breaching(1), count5xx: 0, rate5xx: 0 };
    expect(planActions([healthy], [], 7)).toEqual({ create: [], comment: [], deferred: [] });
  });

  it("comments on an open issue carrying the marker instead of filing a duplicate", () => {
    const g = breaching(1);
    const open = [{ number: 42, body: `intro\n${markerFor(g)}\nmore` }];
    const plan = planActions([g], open, 7);
    expect(plan.create).toEqual([]);
    expect(plan.comment).toHaveLength(1);
    expect(plan.comment[0].number).toBe(42);
  });

  it("caps new issues at 5 and defers the rest, while comments are uncapped", () => {
    const groups = [1, 2, 3, 4, 5, 6, 7].map(breaching);
    const plan = planActions(groups, [], 7);
    expect(MAX_NEW_ISSUES).toBe(5);
    expect(plan.create).toHaveLength(5);
    expect(plan.deferred).toHaveLength(2);

    const open = groups.map((g, i) => ({ number: i + 1, body: markerFor(g) }));
    expect(planActions(groups, open, 7).comment).toHaveLength(7);
  });

  it("orders the most-failing endpoints first so the cap keeps the worst", () => {
    const worse = { ...breaching(9), rate5xx: 0.9, count5xx: 90 };
    const groups = [1, 2, 3, 4, 5, 6].map(breaching).concat(worse);
    const plan = planActions(groups, [], 7);
    expect(plan.create[0].group.path).toBe(worse.path);
  });
});

describe("main", () => {
  const rows = [
    sqlRow("GET", `${API}/v1/reservations/1`, 200, 50),
    sqlRow("GET", `${API}/v1/reservations/1`, 500, 50),
  ];

  function deps(overrides = {}) {
    return {
      fetchImpl: vi.fn(async () => response(200, jsonl(rows))),
      gh: vi.fn(async (args) => (args[0] === "issue" && args[1] === "list" ? "[]" : "")),
      argv: [],
      stdout: capture(),
      stderr: capture(),
      ...overrides,
    };
  }

  it("fails closed without a token and never queries", async () => {
    const d = deps();
    const code = await main({ CLOUDFLARE_ACCOUNT_ID: "acct" }, d);
    expect(code).toBe(1);
    expect(d.stderr.text()).toContain("CLOUDFLARE_API_TOKEN");
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(d.gh).not.toHaveBeenCalled();
  });

  it("fails closed on a query error", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => response(403, "nope")) });
    expect(await main(ENV, d)).toBe(1);
    expect(d.stderr.text()).toContain("403");
    expect(d.gh).not.toHaveBeenCalled();
  });

  it("warns and flags issue bodies when the result hits the row limit", async () => {
    const full = Array.from({ length: QUERY_ROW_LIMIT }, (_, i) =>
      sqlRow("GET", `${API}/v1/reservations/${i}`, i === 0 ? 500 : 200, i === 0 ? 5000 : 1)
    );
    const d = deps({ fetchImpl: vi.fn(async () => response(200, jsonl(full))) });
    expect(await main(ENV, d)).toBe(0);
    expect(d.stderr.text()).toMatch(/truncated/i);
    const create = d.gh.mock.calls.find(([a]) => a[1] === "create");
    expect(create[0].join("\n")).toMatch(/may be low/);
  });

  it("does not warn below the row limit", async () => {
    const d = deps();
    await main(ENV, d);
    expect(d.stderr.text()).not.toMatch(/truncated/i);
  });

  it("fails closed on zero rows for the whole window", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => response(200, "")) });
    expect(await main(ENV, d)).toBe(1);
    expect(d.stderr.text()).toMatch(/zero rows/i);
  });

  it("--dry-run prints the report and planned issues without writing", async () => {
    const d = deps({ argv: ["--dry-run"] });
    expect(await main(ENV, d)).toBe(0);
    expect(d.stdout.text()).toContain("api-failures: GET /api/v1/reservations/:id");
    const writes = d.gh.mock.calls.filter(([a]) => a[1] === "create" || a[1] === "comment");
    expect(writes).toEqual([]);
  });

  it("files a labelled issue for a breaching endpoint", async () => {
    const d = deps();
    expect(await main(ENV, d)).toBe(0);
    const create = d.gh.mock.calls.find(([a]) => a[0] === "issue" && a[1] === "create");
    expect(create).toBeDefined();
    const args = create[0];
    expect(args).toContain("--repo");
    for (const label of ["ready", "bug", "production-health", "area:reservations"]) {
      expect(args).toContain(label);
    }
  });

  it("returns 1 when filing fails, so a broken run is not silent", async () => {
    const d = deps({
      gh: vi.fn(async (args) => {
        if (args[1] === "list") return "[]";
        throw new Error("gh boom");
      }),
    });
    expect(await main(ENV, d)).toBe(1);
    expect(d.stderr.text()).toContain("gh boom");
  });

  it("rejects unknown arguments", async () => {
    const d = deps({ argv: ["--nope"] });
    expect(await main(ENV, d)).toBe(1);
  });
});

describe("workflow wiring", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

  it("is picked up by findScheduledWorkflows()", () => {
    const found = findScheduledWorkflows(join(root, ".github", "workflows"));
    expect(found.map((w) => w.file)).toContain("api-failures.yml");
  });

  it("runs Mondays 15:00 UTC with pipefail and the dedicated token secret", () => {
    const yml = readFileSync(join(root, ".github", "workflows", "api-failures.yml"), "utf-8");
    expect(yml).toContain('cron: "0 15 * * 1"');
    expect(yml).toContain("workflow_dispatch");
    expect(yml).toContain("set -o pipefail");
    expect(yml).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(yml).not.toContain("secrets.MBE_CLOUDFLARE_API_TOKEN");
  });
});
