import { describe, it, expect } from "vitest";
import {
  extractOrigins,
  parseCorsConfig,
  classifyEdgeRouterContent,
  buildReport,
  findPriorCorsAuditIssue,
} from "../cors-audit.mjs";

// ---------------------------------------------------------------------------
// extractOrigins — pure origin-parsing from raw app.ts content
// ---------------------------------------------------------------------------

describe("extractOrigins", () => {
  it("flags a literal wildcard origin", () => {
    const origins = extractOrigins(`origin: "*",`);
    expect(origins.hasWildcard).toBe(true);
  });

  it("flags origin: true as a wildcard", () => {
    const origins = extractOrigins(`origin: true,`);
    expect(origins.hasWildcard).toBe(true);
  });

  it("does not flag an explicit origin list as a wildcard", () => {
    const origins = extractOrigins(`origin: ["https://mattbutlerengineering.com"],`);
    expect(origins.hasWildcard).toBe(false);
  });

  it("detects credentials: true", () => {
    expect(extractOrigins(`credentials: true,`).hasCredentials).toBe(true);
    expect(extractOrigins(`credentials: false,`).hasCredentials).toBe(false);
  });

  it("gates dev origins only when NODE_ENV development check accompanies localhost", () => {
    const guarded = extractOrigins(
      `if (process.env.NODE_ENV === "development") { origin.push("http://localhost:5173"); }`
    );
    expect(guarded.hasEnvGuard).toBe(true);

    const unguarded = extractOrigins(`origin: ["http://localhost:5173"],`);
    expect(unguarded.hasEnvGuard).toBe(false);
    expect(unguarded.hasDevOrigins).toBe(true);
  });

  it("counts unique prod and dev origins", () => {
    const origins = extractOrigins(
      `origin: ["https://a.example.com", "https://a.example.com", "http://localhost:3000"],`
    );
    expect(origins.prodOrigins).toEqual(["https://a.example.com"]);
    expect(origins.devOrigins).toEqual(["http://localhost:3000"]);
    expect(origins.originCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// parseCorsConfig — the finding-vs-no-finding classification (given content)
// ---------------------------------------------------------------------------

function withOrigins(list) {
  return `[${list.map((o) => `"${o}"`).join(", ")}]`;
}

describe("parseCorsConfig", () => {
  it("reports no findings when the service does not register @fastify/cors", () => {
    const result = parseCorsConfig("plain-service", `export function buildApp() {}`);
    expect(result).toEqual({ serviceName: "plain-service", hasCors: false, findings: [] });
  });

  it("flags a wildcard origin as CRITICAL", () => {
    const content = `@fastify/cors\norigin: "*",`;
    const result = parseCorsConfig("svc", content);
    expect(result.hasCors).toBe(true);
    expect(
      result.findings.some((f) => f.severity === "CRITICAL" && f.issue.includes("Wildcard"))
    ).toBe(true);
  });

  it("flags credentials + wildcard as an additional CRITICAL finding", () => {
    const content = `@fastify/cors\norigin: "*",\ncredentials: true,`;
    const result = parseCorsConfig("svc", content);
    const critical = result.findings.filter((f) => f.severity === "CRITICAL");
    expect(critical.length).toBe(2);
  });

  it("flags CORS_ORIGINS env override as MEDIUM", () => {
    const content = `@fastify/cors\norigin: ["https://a.example.com"],\nCORS_ORIGINS`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.severity === "MEDIUM")).toBe(true);
  });

  it("boundary: exactly 5 origins with credentials does NOT trigger the broad-origin-list finding", () => {
    const origins = ["a", "b", "c", "d", "e"].map((c) => `https://${c}.example.com`);
    const content = `@fastify/cors\norigin: ${withOrigins(origins)},\ncredentials: true,`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.issue.includes("broad origin list"))).toBe(false);
  });

  it("boundary: 6 origins with credentials DOES trigger the broad-origin-list finding", () => {
    const origins = ["a", "b", "c", "d", "e", "f"].map((c) => `https://${c}.example.com`);
    const content = `@fastify/cors\norigin: ${withOrigins(origins)},\ncredentials: true,`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.issue.includes("broad origin list"))).toBe(true);
  });

  it("flags destructive HTTP methods (DELETE/PATCH) as INFO", () => {
    const content = `@fastify/cors\nmethods: ["GET", "POST", "DELETE"],`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.severity === "INFO")).toBe(true);
  });

  it("does not flag methods without DELETE/PATCH", () => {
    const content = `@fastify/cors\nmethods: ["GET", "POST"],`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.severity === "INFO")).toBe(false);
  });

  it("flags dev origins leaking into prod when not gated by NODE_ENV", () => {
    const content = `@fastify/cors\norigin: ["http://localhost:5173"],`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.issue.includes("Dev origins"))).toBe(true);
  });

  it("does not flag dev origins gated behind NODE_ENV === development", () => {
    const content = `@fastify/cors\nif (process.env.NODE_ENV === "development") { origin.push("http://localhost:5173"); }`;
    const result = parseCorsConfig("svc", content);
    expect(result.findings.some((f) => f.issue.includes("Dev origins"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyEdgeRouterContent — security header + CSP classification
// ---------------------------------------------------------------------------

const ALL_HEADERS_PRESENT = `
const headers = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'",
};
`;

describe("classifyEdgeRouterContent", () => {
  it("flags missing security headers as HIGH", () => {
    const result = classifyEdgeRouterContent(`const x = 1;`);
    expect(result.missingHeaders.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.severity === "HIGH" && f.issue.includes("Missing"))).toBe(
      true
    );
  });

  it("does not flag missing headers when all required headers are present", () => {
    const result = classifyEdgeRouterContent(ALL_HEADERS_PRESENT);
    expect(result.missingHeaders).toEqual([]);
    expect(result.findings.some((f) => f.issue.includes("Missing"))).toBe(false);
  });

  it("flags unsafe-inline CSP without a nonce as HIGH", () => {
    const content = `"Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
    ].join("; "),`;
    const result = classifyEdgeRouterContent(content);
    expect(result.findings.some((f) => f.issue.includes("unsafe-inline"))).toBe(true);
  });

  it("boundary: unsafe-inline WITH a nonce is not flagged", () => {
    const content = `"Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'nonce-abc123'",
    ].join("; "),`;
    const result = classifyEdgeRouterContent(content);
    expect(result.findings.some((f) => f.issue.includes("unsafe-inline"))).toBe(false);
  });

  it("flags unsafe-eval as CRITICAL", () => {
    const content = `"Content-Security-Policy": [
      "script-src 'self' 'unsafe-eval'",
    ].join("; "),`;
    const result = classifyEdgeRouterContent(content);
    expect(
      result.findings.some((f) => f.severity === "CRITICAL" && f.issue.includes("dynamic code"))
    ).toBe(true);
  });

  it("flags X-XSS-Protection: 1 as LOW", () => {
    const content = `"X-XSS-Protection": "1; mode=block",`;
    const result = classifyEdgeRouterContent(content);
    expect(result.findings.some((f) => f.severity === "LOW")).toBe(true);
  });

  it("flags connect-src wildcard as HIGH", () => {
    const content = `connect-src *; script-src 'self';`;
    const result = classifyEdgeRouterContent(content);
    expect(result.findings.some((f) => f.issue.includes("connect-src"))).toBe(true);
  });

  it("flags Access-Control-Allow-Origin: * as CRITICAL", () => {
    const content = `"Access-Control-Allow-Origin": "*",`;
    const result = classifyEdgeRouterContent(content);
    expect(
      result.findings.some(
        (f) => f.severity === "CRITICAL" && f.issue.includes("Access-Control-Allow-Origin")
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildReport — pure aggregation, unchanged shape
// ---------------------------------------------------------------------------

describe("buildReport", () => {
  it("returns null when there are no findings anywhere", () => {
    const serviceResults = [{ serviceName: "svc", hasCors: false, findings: [] }];
    const edgeResult = { findings: [], presentHeaders: [], missingHeaders: [] };
    expect(buildReport(serviceResults, edgeResult)).toBeNull();
  });

  it("builds a title carrying severity counts and a body with the finding detail", () => {
    const serviceResults = [
      {
        serviceName: "svc",
        hasCors: true,
        origins: {
          originCount: 1,
          prodOrigins: ["https://a.example.com"],
          devOrigins: [],
          hasCredentials: false,
          usesEnvOverride: false,
        },
        findings: [
          {
            severity: "CRITICAL",
            issue: "Wildcard `*` origin detected",
            detail: "detail",
            remediation: "fix it",
          },
        ],
      },
    ];
    const edgeResult = { findings: [], presentHeaders: [], missingHeaders: [] };
    const report = buildReport(serviceResults, edgeResult);
    expect(report.title).toBe("CORS audit: 1 critical, 0 high, 0 other");
    expect(report.body).toContain("Wildcard `*` origin detected");
  });
});

// ---------------------------------------------------------------------------
// findPriorCorsAuditIssue — dedupe lookup feeding fileIssue()
// ---------------------------------------------------------------------------

describe("findPriorCorsAuditIssue", () => {
  it("returns null when there are no candidates", () => {
    expect(findPriorCorsAuditIssue([])).toBeNull();
  });

  it("returns the number of a prior CORS audit issue by title prefix", () => {
    const candidates = [
      { number: 5, title: "some unrelated issue" },
      { number: 9, title: "CORS audit: 1 critical, 0 high, 2 other" },
    ];
    expect(findPriorCorsAuditIssue(candidates)).toBe(9);
  });

  it("returns null when no candidate title matches the CORS audit prefix", () => {
    const candidates = [{ number: 5, title: "some unrelated issue" }];
    expect(findPriorCorsAuditIssue(candidates)).toBeNull();
  });
});
