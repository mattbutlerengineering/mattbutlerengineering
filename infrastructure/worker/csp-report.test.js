/**
 * Tests for the /csp-report handler (#8895).
 *
 * Browsers POST CSP violation reports here in two shapes: the legacy
 * `report-uri` body (`application/csp-report`, `{"csp-report": {...}}`) and the
 * Reporting API batch (`application/reports+json`, an array of
 * `{type: "csp-violation", body: {...}}`). Every request is untrusted input.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCspReport, CSP_REPORT_MAX_BYTES, normalizeViolation } from "./csp-report.js";
import { CSP_REPORTS_COLUMNS } from "./analytics-schema.js";

const URL_BASE = "https://mattbutlerengineering.com/csp-report";

function post(body, contentType, extraHeaders = {}) {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": contentType, ...extraHeaders },
    body,
  });
}

function createEnv() {
  return { CSP_REPORTS: { writeDataPoint: vi.fn() } };
}

const LEGACY_BODY = {
  "csp-report": {
    "document-uri": "https://mattbutlerengineering.com/rialto/components/button?token=secret",
    referrer: "",
    "violated-directive": "font-src",
    "effective-directive": "font-src",
    "original-policy": "default-src 'self'",
    disposition: "enforce",
    "blocked-uri": "https://fonts.gstatic.com/s/inter/v1/font.woff2?key=abc",
    "status-code": 200,
  },
};

const REPORTING_BODY = [
  {
    type: "csp-violation",
    age: 10,
    url: "https://mattbutlerengineering.com/hospitality/",
    user_agent: "test",
    body: {
      documentURL: "https://mattbutlerengineering.com/hospitality/reservations?id=42",
      effectiveDirective: "script-src-elem",
      blockedURL: "https://evil.example/x.js?q=1",
      disposition: "report",
      originalPolicy: "default-src 'self'",
      statusCode: 200,
    },
  },
  { type: "deprecation", body: { id: "x" } },
  {
    type: "csp-violation",
    body: {
      documentURL: "https://mattbutlerengineering.com/",
      effectiveDirective: "script-src-attr",
      blockedURL: "inline",
      disposition: "enforce",
    },
  },
];

function dataPointFields(env, callIndex) {
  const point = env.CSP_REPORTS.writeDataPoint.mock.calls[callIndex][0];
  return Object.fromEntries(
    Object.entries(CSP_REPORTS_COLUMNS)
      .filter(([field]) => field !== "index")
      .map(([field, column]) => [field, point.blobs[Number(column.slice(4)) - 1]])
  );
}

describe("handleCspReport", () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("accepts a legacy application/csp-report body and returns 204", async () => {
    const env = createEnv();
    const res = await handleCspReport(
      post(JSON.stringify(LEGACY_BODY), "application/csp-report"),
      env
    );

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(env.CSP_REPORTS.writeDataPoint).toHaveBeenCalledTimes(1);
    expect(dataPointFields(env, 0)).toEqual({
      directive: "font-src",
      blockedOrigin: "https://fonts.gstatic.com",
      documentPath: "/rialto/components/button",
      disposition: "enforce",
    });
  });

  it("writes one structured log line per violation", async () => {
    const env = createEnv();
    await handleCspReport(post(JSON.stringify(LEGACY_BODY), "application/csp-report"), env);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(logSpy.mock.calls[0][0]);
    expect(line).toEqual({
      event: "csp-violation",
      directive: "font-src",
      blockedOrigin: "https://fonts.gstatic.com",
      documentPath: "/rialto/components/button",
      disposition: "enforce",
    });
  });

  it("strips query strings and paths so no URL secret reaches the log", async () => {
    const env = createEnv();
    await handleCspReport(post(JSON.stringify(LEGACY_BODY), "application/csp-report"), env);

    const logged = logSpy.mock.calls[0][0];
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("key=abc");
    expect(logged).not.toContain("font.woff2");
  });

  it("accepts an application/reports+json batch, recording only csp-violation entries", async () => {
    const env = createEnv();
    const res = await handleCspReport(
      post(JSON.stringify(REPORTING_BODY), "application/reports+json"),
      env
    );

    expect(res.status).toBe(204);
    expect(env.CSP_REPORTS.writeDataPoint).toHaveBeenCalledTimes(2);
    expect(dataPointFields(env, 0)).toEqual({
      directive: "script-src-elem",
      blockedOrigin: "https://evil.example",
      documentPath: "/hospitality/reservations",
      disposition: "report",
    });
    expect(dataPointFields(env, 1)).toEqual({
      directive: "script-src-attr",
      blockedOrigin: "inline",
      documentPath: "/",
      disposition: "enforce",
    });
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it("accepts a content type carrying parameters (charset)", async () => {
    const env = createEnv();
    const res = await handleCspReport(
      post(JSON.stringify(LEGACY_BODY), "application/csp-report; charset=utf-8"),
      env
    );
    expect(res.status).toBe(204);
  });

  it("rejects GET with 405 and an Allow header", async () => {
    const env = createEnv();
    const res = await handleCspReport(new Request(URL_BASE, { method: "GET" }), env);

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(env.CSP_REPORTS.writeDataPoint).not.toHaveBeenCalled();
  });

  it("rejects an unsupported content type with 415", async () => {
    const res = await handleCspReport(post(JSON.stringify(LEGACY_BODY), "text/plain"), createEnv());
    expect(res.status).toBe(415);
  });

  it("rejects a body over the size cap with 413 without recording it", async () => {
    const env = createEnv();
    const padding = "x".repeat(CSP_REPORT_MAX_BYTES);
    const body = JSON.stringify({ "csp-report": { ...LEGACY_BODY["csp-report"], padding } });
    const res = await handleCspReport(post(body, "application/csp-report"), env);

    expect(res.status).toBe(413);
    expect(env.CSP_REPORTS.writeDataPoint).not.toHaveBeenCalled();
  });

  it("rejects an oversize declared Content-Length before reading the body", async () => {
    const env = createEnv();
    const request = post("{}", "application/csp-report", {
      "Content-Length": String(CSP_REPORT_MAX_BYTES + 1),
    });
    const res = await handleCspReport(request, env);
    expect(res.status).toBe(413);
  });

  it("caps at 16 KB", () => {
    expect(CSP_REPORT_MAX_BYTES).toBe(16 * 1024);
  });

  it("rejects unparseable JSON with 400 and does not throw", async () => {
    const env = createEnv();
    const res = await handleCspReport(post("{not json", "application/csp-report"), env);

    expect(res.status).toBe(400);
    expect(env.CSP_REPORTS.writeDataPoint).not.toHaveBeenCalled();
  });

  it("rejects well-formed JSON of the wrong shape with 400", async () => {
    const legacy = await handleCspReport(post("[1,2]", "application/csp-report"), createEnv());
    const reporting = await handleCspReport(
      post(JSON.stringify({ "csp-report": {} }), "application/reports+json"),
      createEnv()
    );
    const nullBody = await handleCspReport(post("null", "application/csp-report"), createEnv());

    expect(legacy.status).toBe(400);
    expect(reporting.status).toBe(400);
    expect(nullBody.status).toBe(400);
  });

  it("never echoes request input into the response body", async () => {
    const res = await handleCspReport(
      post("<script>alert(1)</script>", "application/csp-report"),
      createEnv()
    );
    expect(await res.text()).not.toContain("<script>");
  });

  it("still returns 204 when the Analytics Engine write throws (fail-open)", async () => {
    const env = createEnv();
    env.CSP_REPORTS.writeDataPoint.mockImplementation(() => {
      throw new Error("Analytics Engine unavailable");
    });
    const res = await handleCspReport(
      post(JSON.stringify(LEGACY_BODY), "application/csp-report"),
      env
    );

    expect(res.status).toBe(204);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 204 and still logs when the CSP_REPORTS binding is absent", async () => {
    const res = await handleCspReport(
      post(JSON.stringify(LEGACY_BODY), "application/csp-report"),
      {}
    );
    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 400 rather than throwing when reading the body fails", async () => {
    const request = {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/csp-report" }),
      body: new ReadableStream({
        pull() {
          throw new Error("stream broke");
        },
      }),
    };
    const res = await handleCspReport(request, createEnv());
    expect(res.status).toBe(400);
  });
});

describe("normalizeViolation", () => {
  it("keeps only the scheme for non-network blocked URIs", () => {
    expect(
      normalizeViolation({ directive: "img-src", blocked: "data:image/png;base64,AAAA" })
        .blockedOrigin
    ).toBe("data");
    expect(normalizeViolation({ directive: "script-src", blocked: "eval" }).blockedOrigin).toBe(
      "eval"
    );
  });

  it("reduces junk to bounded placeholders", () => {
    const v = normalizeViolation({
      directive: "x".repeat(500),
      blocked: "<img src=x onerror=alert(1)>",
      document: 42,
      disposition: "nonsense",
    });
    expect(v).toEqual({
      directive: "unknown",
      blockedOrigin: "other",
      documentPath: "unknown",
      disposition: "unknown",
    });
  });

  it("reports an empty blocked URI as none", () => {
    expect(normalizeViolation({ directive: "img-src", blocked: "" }).blockedOrigin).toBe("none");
  });

  it("caps a very long document path", () => {
    const v = normalizeViolation({
      directive: "img-src",
      document: `https://mattbutlerengineering.com/${"a".repeat(2000)}`,
    });
    expect(v.documentPath.length).toBeLessThanOrEqual(256);
  });
});
