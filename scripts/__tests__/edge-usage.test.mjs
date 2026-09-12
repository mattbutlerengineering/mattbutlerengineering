/**
 * Tests for scripts/edge-usage.mjs — the read path for the edge_requests
 * Analytics Engine dataset.
 *
 * Every SQL expectation is assembled from infrastructure/worker/analytics-schema.js
 * (never the literals blob1 / blob4 / edge_requests), so a layout change in the
 * schema module fails here as well as in the writer's tests. The fetch is a
 * vi.fn(): no real query runs in this suite — no token with Account Analytics
 * Read exists to the run (docs/fixes/rialto-web-usage-instrumentation).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  EDGE_REQUESTS_COLUMNS,
  EDGE_REQUESTS_DATASET,
} from "../../infrastructure/worker/analytics-schema.js";
import {
  buildUsageQuery,
  parseArgs,
  queryEdgeUsage,
  parseRows,
  main,
  ZERO_ROWS_MESSAGE,
} from "../edge-usage.mjs";

const normalize = (sql) => sql.replace(/\s+/g, " ").trim();

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

function capture() {
  const chunks = [];
  return { write: (chunk) => chunks.push(String(chunk)), text: () => chunks.join("") };
}

const ENV = { CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acct" };
const ROW_A = { route: "rialto", pathname: "/rialto/components/button", requests: 42 };
const ROW_B = { route: "marketing", pathname: "/", requests: 7 };

describe("edge-usage", () => {
  describe("buildUsageQuery", () => {
    it("defaults to requests per route and pathname over the last 7 days, summing _sample_interval", () => {
      const sql = buildUsageQuery();
      const expected = normalize(`
        SELECT ${EDGE_REQUESTS_COLUMNS.route} AS route,
               ${EDGE_REQUESTS_COLUMNS.pathname} AS pathname,
               SUM(_sample_interval) AS requests
        FROM ${EDGE_REQUESTS_DATASET}
        WHERE timestamp > NOW() - INTERVAL '7' DAY
        GROUP BY route, pathname
        ORDER BY requests DESC
        LIMIT 100
        FORMAT JSONEachRow
      `);

      expect(normalize(sql)).toBe(expected);
      expect(sql).toContain("SUM(_sample_interval)");
      expect(sql).toContain("FORMAT JSONEachRow");
      expect(sql).not.toContain("COUNT(");
    });

    it("applies --days and --route after validation", () => {
      const sql = buildUsageQuery({ days: 30, route: "rialto" });

      expect(sql).toContain("INTERVAL '30' DAY");
      expect(sql).toContain(`AND ${EDGE_REQUESTS_COLUMNS.route} = 'rialto'`);
    });

    it("refuses to interpolate a route outside the allowlist pattern (the injection boundary)", () => {
      expect(() => buildUsageQuery({ route: "x' OR 1=1" })).toThrow(/route/);
      expect(() => buildUsageQuery({ days: 0 })).toThrow(/days/);
    });
  });

  describe("parseArgs", () => {
    it("defaults to 7 days and no route", () => {
      expect(parseArgs([])).toEqual({ days: 7, route: null, error: null });
    });

    it("accepts a valid --days and --route", () => {
      expect(parseArgs(["--days", "30", "--route", "rialto"])).toEqual({
        days: 30,
        route: "rialto",
        error: null,
      });
    });

    it.each([
      [["--days", "0"], /--days/],
      [["--days", "91"], /--days/],
      [["--days", "7.5"], /--days/],
      [["--route", "x' OR 1=1"], /--route/],
      [["--route", "Rialto"], /--route/],
      [["--bogus"], /--bogus/],
    ])("rejects %j as a usage error and never lets the value through", (argv, pattern) => {
      const parsed = parseArgs(argv);

      expect(parsed.error).toMatch(pattern);
      expect(parsed.days).toBeNull();
      expect(parsed.route).toBeNull();
    });
  });

  describe("queryEdgeUsage", () => {
    it("POSTs the SQL as the body to the account's SQL endpoint with a Bearer token", async () => {
      const fetchImpl = vi.fn(async () => response(200, ""));
      const sql = buildUsageQuery();

      await queryEdgeUsage({ fetchImpl, accountId: "acct", token: "tok", sql });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/analytics_engine/sql");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer tok");
      expect(init.body).toBe(sql);
    });

    it.each([401, 403])("names the missing scope on a %i", async (code) => {
      const fetchImpl = vi.fn(async () => response(code, "Authentication error"));

      await expect(
        queryEdgeUsage({ fetchImpl, accountId: "acct", token: "tok", sql: "SELECT 1" })
      ).rejects.toThrow(/Analytics Engine SQL API failed: 40[13]/);
      await expect(
        queryEdgeUsage({ fetchImpl, accountId: "acct", token: "tok", sql: "SELECT 1" })
      ).rejects.toThrow(/Account Analytics Read/);
    });

    it("surfaces the status and body on any other non-2xx", async () => {
      const fetchImpl = vi.fn(async () => response(500, "upstream exploded"));

      await expect(
        queryEdgeUsage({ fetchImpl, accountId: "acct", token: "tok", sql: "SELECT 1" })
      ).rejects.toThrow(/500.*upstream exploded/);
    });
  });

  describe("parseRows", () => {
    it("parses JSONEachRow into one object per line", () => {
      const text = `${JSON.stringify(ROW_A)}\n${JSON.stringify(ROW_B)}\n`;
      expect(parseRows(text)).toEqual([ROW_A, ROW_B]);
    });

    it("returns [] for an empty body", () => {
      expect(parseRows("")).toEqual([]);
    });

    it("throws on a non-JSON line", () => {
      expect(() => parseRows("not json")).toThrow(/non-JSON/);
    });
  });

  describe("main", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit must not be called inside main()");
    });

    afterEach(() => {
      exitSpy.mockClear();
    });

    it("returns 1 and names the first missing variable when env is empty", async () => {
      const fetchImpl = vi.fn();
      const stderr = capture();

      const code = await main({}, { fetchImpl, argv: [], stdout: capture(), stderr });

      expect(code).toBe(1);
      expect(stderr.text()).toContain(
        "Missing required environment variable: CLOUDFLARE_API_TOKEN"
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("returns 0 and points at the runbook when the query returns zero rows", async () => {
      const fetchImpl = vi.fn(async () => response(200, ""));
      const stdout = capture();

      const code = await main(ENV, { fetchImpl, argv: [], stdout, stderr: capture() });

      expect(code).toBe(0);
      expect(stdout.text()).toContain(ZERO_ROWS_MESSAGE);
      expect(ZERO_ROWS_MESSAGE).toBe("0 rows — see docs/runbooks/edge-usage.md");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("prints one line per row", async () => {
      const body = `${JSON.stringify(ROW_A)}\n${JSON.stringify(ROW_B)}\n`;
      const fetchImpl = vi.fn(async () => response(200, body));
      const stdout = capture();

      const code = await main(ENV, {
        fetchImpl,
        argv: ["--days", "30"],
        stdout,
        stderr: capture(),
      });

      expect(code).toBe(0);
      const lines = stdout.text().split("\n");
      expect(
        lines.some((l) => l.includes("rialto") && l.includes(ROW_A.pathname) && l.includes("42"))
      ).toBe(true);
      expect(lines.some((l) => l.includes("marketing") && l.includes("/") && l.includes("7"))).toBe(
        true
      );
      expect(fetchImpl.mock.calls[0][1].body).toContain("INTERVAL '30' DAY");
    });

    it("returns 1 and prints usage on a bad argument, without touching the network", async () => {
      const fetchImpl = vi.fn();
      const stderr = capture();

      const code = await main(ENV, { fetchImpl, argv: ["--days", "0"], stdout: capture(), stderr });

      expect(code).toBe(1);
      expect(stderr.text()).toMatch(/Usage:/);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("returns 1 with the API error message on a 403", async () => {
      const fetchImpl = vi.fn(async () => response(403, "forbidden"));
      const stderr = capture();

      const code = await main(ENV, { fetchImpl, argv: [], stdout: capture(), stderr });

      expect(code).toBe(1);
      expect(stderr.text()).toContain("Analytics Engine SQL API failed: 403");
      expect(stderr.text()).toContain("Account Analytics Read");
    });
  });
});
