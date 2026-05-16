#!/usr/bin/env node
/**
 * CORS Configuration Audit
 *
 * Scans Fastify service app.ts files for @fastify/cors registration and
 * the edge router for security headers. Flags wildcard origins, credentials
 * with broad origins, and missing security headers.
 *
 * Optional: DRY_RUN=1 — print report to stdout instead of creating an issue
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SERVICES_DIR = resolve(ROOT, "services");
const EDGE_ROUTER_PATH = resolve(ROOT, "infrastructure/worker/edge-router.js");

const REQUIRED_HEADERS = [
  "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options",
  "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy",
];

const HEADER_ADVICE = {
  "Strict-Transport-Security": "`max-age=31536000; includeSubDomains`",
  "X-Frame-Options": "`DENY`",
  "X-Content-Type-Options": "`nosniff`",
  "Referrer-Policy": "`strict-origin-when-cross-origin`",
  "Permissions-Policy": "`camera=(), microphone=(), geolocation=()`",
  "Content-Security-Policy": "a restrictive CSP",
};

// ── Service Discovery ──────────────────────────────────────────────

function discoverServices() {
  if (!existsSync(SERVICES_DIR)) return [];
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(resolve(SERVICES_DIR, e.name, "src/app.ts")))
    .map((e) => ({ name: e.name, appPath: resolve(SERVICES_DIR, e.name, "src/app.ts") }));
}

// ── Origin Extraction ──────────────────────────────────────────────

function extractOrigins(content) {
  const prodMatches = content.match(/https:\/\/[a-z0-9.-]+/g) || [];
  const devMatches = content.match(/http:\/\/localhost:\d+/g) || [];
  const prodOrigins = [...new Set(prodMatches)];
  const devOrigins = [...new Set(devMatches)];
  const hasEnvGuard = Boolean(content.match(/NODE_ENV\s*===?\s*['"]development['"]/) && content.includes("localhost"));

  return {
    hasWildcard: Boolean(content.match(/origin:\s*['"]?\*['"]?/) || content.match(/origin:\s*true/)),
    hasCredentials: Boolean(content.match(/credentials:\s*true/)),
    hasDevOrigins: content.includes("localhost"),
    hasEnvGuard,
    usesEnvOverride: content.includes("CORS_ORIGINS"),
    originCount: prodOrigins.length + devOrigins.length,
    prodOrigins,
    devOrigins,
  };
}

// ── CORS Config Analysis ───────────────────────────────────────────

function parseCorsConfig(serviceName, appPath) {
  const content = readFileSync(appPath, "utf-8");
  if (!content.includes("@fastify/cors")) {
    return { serviceName, hasCors: false, findings: [] };
  }

  const findings = [];
  const origins = extractOrigins(content);
  const svc = `services/${serviceName}/src/app.ts`;

  if (origins.hasWildcard) {
    findings.push({ severity: "CRITICAL", issue: "Wildcard `*` origin detected",
      detail: "Allows any domain to make cross-origin requests.",
      remediation: `Replace wildcard with explicit allowlist in \`${svc}\`.` });
  }

  if (origins.hasCredentials && origins.hasWildcard) {
    findings.push({ severity: "CRITICAL", issue: "`credentials: true` with wildcard origin",
      detail: "Most dangerous CORS misconfiguration. Browsers block it, but proxies may not.",
      remediation: `Remove wildcard and use explicit origins in \`${svc}\`.` });
  }

  if (origins.usesEnvOverride) {
    findings.push({ severity: "MEDIUM", issue: "`CORS_ORIGINS` env override allows runtime changes",
      detail: "Runtime env var can override hardcoded origins. Ensure secure infrastructure config.",
      remediation: `Validate CORS_ORIGINS against an allowlist in \`${svc}\`.` });
  }

  if (origins.hasCredentials && !origins.hasWildcard && origins.originCount > 5) {
    findings.push({ severity: "HIGH", issue: "`credentials: true` with broad origin list",
      detail: `${origins.originCount} origins with credentials enabled.`,
      remediation: `Reduce origin list to first-party domains only in \`${svc}\`.` });
  }

  const methodsMatch = content.match(/methods:\s*\[([\s\S]*?)\]/);
  if (methodsMatch) {
    const methods = methodsMatch[1].match(/"([^"]+)"/g)?.map((m) => m.replace(/"/g, "")) || [];
    if (methods.includes("DELETE") || methods.includes("PATCH")) {
      findings.push({ severity: "INFO", issue: "Destructive HTTP methods allowed via CORS",
        detail: `Methods: ${methods.join(", ")}. Verify intentional.`,
        remediation: `Review \`${svc}\` to confirm DELETE/PATCH are needed cross-origin.` });
    }
  }

  if (origins.hasDevOrigins && !origins.hasEnvGuard) {
    findings.push({ severity: "HIGH", issue: "Dev origins may leak into production",
      detail: "localhost origins not gated behind `NODE_ENV` check.",
      remediation: `Gate dev origins with \`NODE_ENV === 'development'\` in \`${svc}\`.` });
  }

  return { serviceName, hasCors: true, origins, findings };
}

// ── Edge Router Analysis ───────────────────────────────────────────

function analyzeEdgeRouter() {
  const findings = [];
  if (!existsSync(EDGE_ROUTER_PATH)) {
    findings.push({ severity: "CRITICAL", issue: "Edge router file not found",
      detail: "Expected at `infrastructure/worker/edge-router.js`.",
      remediation: "Verify the edge router path." });
    return { findings, presentHeaders: [], missingHeaders: REQUIRED_HEADERS };
  }

  const content = readFileSync(EDGE_ROUTER_PATH, "utf-8");
  const presentHeaders = REQUIRED_HEADERS.filter((h) => content.includes(h));
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !content.includes(h));

  if (missingHeaders.length > 0) {
    const items = missingHeaders.map((h) => `- \`${h}\`: ${HEADER_ADVICE[h]}`).join("\n");
    findings.push({ severity: "HIGH",
      issue: `Missing security headers (${missingHeaders.length})`,
      detail: `Missing: ${missingHeaders.map((h) => `\`${h}\``).join(", ")}`,
      remediation: `Add to \`buildSecurityHeaders()\` in edge-router.js:\n${items}` });
  }

  const cspMatch = content.match(/Content-Security-Policy['"]\s*:\s*\[([\s\S]*?)\]\.join/);
  if (cspMatch) {
    const csp = cspMatch[1];
    if (csp.includes("'unsafe-inline'") && !csp.includes("nonce-")) {
      findings.push({ severity: "HIGH", issue: "CSP `unsafe-inline` without nonce",
        detail: "Allows inline script injection.", remediation: "Use nonce-based CSP instead." });
    }
    if (csp.includes("unsafe-eval")) {
      findings.push({ severity: "CRITICAL", issue: "CSP allows dynamic code execution",
        detail: "Permits code injection via dynamic execution.",
        remediation: "Remove the unsafe directive from CSP in edge-router.js." });
    }
  }

  if (content.match(/X-XSS-Protection['"]\s*:\s*['"]1/)) {
    findings.push({ severity: "LOW", issue: "`X-XSS-Protection: 1` can introduce vulnerabilities",
      detail: "Modern best practice is `0`. CSP is the proper mitigation.",
      remediation: "Set `X-XSS-Protection: 0` in edge-router.js." });
  }

  const connectSrc = content.match(/connect-src\s+([^;]+)/);
  if (connectSrc && connectSrc[1].includes("*")) {
    findings.push({ severity: "HIGH", issue: "CSP `connect-src` allows wildcard",
      detail: "Allows connections to any origin.", remediation: "Use explicit origins." });
  }

  if (content.match(/Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/)) {
    findings.push({ severity: "CRITICAL", issue: "Edge router sets `Access-Control-Allow-Origin: *`",
      detail: "Overrides per-service CORS restrictions.",
      remediation: "Remove wildcard ACAO header; rely on per-service CORS." });
  }

  return { findings, presentHeaders, missingHeaders };
}

// ── Report ─────────────────────────────────────────────────────────

function buildReport(serviceResults, edgeResult) {
  const allFindings = [
    ...serviceResults.flatMap((s) => s.findings.map((f) => ({ ...f, source: `services/${s.serviceName}` }))),
    ...edgeResult.findings.map((f) => ({ ...f, source: "edge-router.js" })),
  ];
  if (allFindings.length === 0) return null;

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const sorted = [...allFindings].sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
  const count = (sev) => sorted.filter((f) => f.severity === sev).length;

  const lines = [
    "## Summary\n",
    "| Severity | Count |", "|----------|-------|",
    `| CRITICAL | ${count("CRITICAL")} |`, `| HIGH | ${count("HIGH")} |`,
    `| MEDIUM | ${count("MEDIUM")} |`, `| LOW/INFO | ${count("LOW") + count("INFO")} |`, "",
    "## Service CORS Overview\n",
    "| Service | CORS | Origins | Credentials | Env Override |",
    "|---------|------|---------|-------------|-------------|",
  ];

  for (const svc of serviceResults) {
    if (svc.hasCors) {
      const o = svc.origins;
      lines.push(`| ${svc.serviceName} | Yes | ${o.originCount} (${o.prodOrigins.length} prod, ${o.devOrigins.length} dev) | ${o.hasCredentials ? "Yes" : "No"} | ${o.usesEnvOverride ? "Yes" : "No"} |`);
    } else {
      lines.push(`| ${svc.serviceName} | No | - | - | - |`);
    }
  }

  lines.push("", "## Edge Router Security Headers\n");
  for (const h of REQUIRED_HEADERS) {
    lines.push(`- [${edgeResult.presentHeaders.includes(h) ? "x" : " "}] \`${h}\``);
  }

  lines.push("", "## Findings\n");
  for (const f of sorted) {
    lines.push(`### [${f.severity}] ${f.issue}\n`, `**Source:** \`${f.source}\`\n`,
      `${f.detail}\n`, `**Remediation:** ${f.remediation}\n`, "---\n");
  }
  lines.push("_Generated by `scripts/cors-audit.mjs` via GitHub Actions._");

  const title = `CORS audit: ${count("CRITICAL")} critical, ${count("HIGH")} high, ${count("MEDIUM") + count("LOW") + count("INFO")} other`;
  return { title, body: lines.join("\n") };
}

// ── Issue Creation ─────────────────────────────────────────────────

function createGitHubIssue(title, body) {
  try {
    execFileSync("gh", ["issue", "create", "--title", title,
      "--label", "audit", "--label", "security", "--body", body],
    { cwd: ROOT, stdio: "pipe" });
    console.log(`Created issue: ${title}`);
  } catch (err) {
    console.error("Failed to create GitHub issue:", err.message);
    console.log(`\n--- REPORT ---\n\n# ${title}\n\n${body}`);
    process.exit(1);
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const isDryRun = process.env.DRY_RUN === "1";

  console.log("Discovering services...");
  const services = discoverServices();
  console.log(`  Found ${services.length}: ${services.map((s) => s.name).join(", ")}`);

  console.log("\nAnalyzing CORS configurations...");
  const serviceResults = services.map((s) => parseCorsConfig(s.name, s.appPath));
  for (const r of serviceResults) {
    console.log(`  ${r.serviceName}: ${r.hasCors ? `${r.findings.length} finding(s)` : "no CORS"}`);
  }

  console.log("\nAnalyzing edge router...");
  const edgeResult = analyzeEdgeRouter();
  console.log(`  ${edgeResult.findings.length} finding(s)`);

  const report = buildReport(serviceResults, edgeResult);
  if (!report) { console.log("\nNo issues found."); return; }

  if (isDryRun) {
    console.log(`\n--- DRY RUN ---\n\n# ${report.title}\n\n${report.body}`);
    return;
  }
  createGitHubIssue(report.title, report.body);
}

main().catch((err) => { console.error("CORS audit failed:", err.message); process.exit(1); });
