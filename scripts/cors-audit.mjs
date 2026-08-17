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
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient } from "@mbe/gh-client";
import { getLabelsForSensor } from "./sensors-registry.mjs";
import { fileIssue } from "./lib/issue-filing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SERVICES_DIR = resolve(ROOT, "services");
const WORKER_DIR = resolve(ROOT, "infrastructure/worker");

const REQUIRED_HEADERS = [
  "Strict-Transport-Security",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Content-Security-Policy",
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
    .map((e) => ({
      name: e.name,
      appPath: resolve(SERVICES_DIR, e.name, "src/app.ts"),
    }));
}

// ── Origin Extraction ──────────────────────────────────────────────

export function extractOrigins(content) {
  const prodMatches = content.match(/https:\/\/[a-z0-9.-]+/g) || [];
  const devMatches = content.match(/http:\/\/localhost:\d+/g) || [];
  const prodOrigins = [...new Set(prodMatches)];
  const devOrigins = [...new Set(devMatches)];
  const hasEnvGuard = Boolean(
    content.match(/NODE_ENV\s*===?\s*['"]development['"]/) && content.includes("localhost")
  );

  return {
    hasWildcard: Boolean(
      content.match(/origin:\s*['"]?\*['"]?/) || content.match(/origin:\s*true/)
    ),
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

/**
 * Pure: classifies a service's `src/app.ts` content into findings. No I/O —
 * the caller (`main()`) owns reading `appPath` and hands the content here.
 */
export function parseCorsConfig(serviceName, content) {
  if (!content.includes("@fastify/cors")) {
    return { serviceName, hasCors: false, findings: [] };
  }

  const findings = [];
  const origins = extractOrigins(content);
  const svc = `services/${serviceName}/src/app.ts`;

  if (origins.hasWildcard) {
    findings.push({
      severity: "CRITICAL",
      issue: "Wildcard `*` origin detected",
      detail: "Allows any domain to make cross-origin requests.",
      remediation: `Replace wildcard with explicit allowlist in \`${svc}\`.`,
    });
  }

  if (origins.hasCredentials && origins.hasWildcard) {
    findings.push({
      severity: "CRITICAL",
      issue: "`credentials: true` with wildcard origin",
      detail: "Most dangerous CORS misconfiguration. Browsers block it, but proxies may not.",
      remediation: `Remove wildcard and use explicit origins in \`${svc}\`.`,
    });
  }

  if (origins.usesEnvOverride) {
    findings.push({
      severity: "MEDIUM",
      issue: "`CORS_ORIGINS` env override allows runtime changes",
      detail:
        "Runtime env var can override hardcoded origins. Ensure secure infrastructure config.",
      remediation: `Validate CORS_ORIGINS against an allowlist in \`${svc}\`.`,
    });
  }

  if (origins.hasCredentials && !origins.hasWildcard && origins.originCount > 5) {
    findings.push({
      severity: "HIGH",
      issue: "`credentials: true` with broad origin list",
      detail: `${origins.originCount} origins with credentials enabled.`,
      remediation: `Reduce origin list to first-party domains only in \`${svc}\`.`,
    });
  }

  const methodsMatch = content.match(/methods:\s*\[([\s\S]*?)\]/);
  if (methodsMatch) {
    const methods = methodsMatch[1].match(/"([^"]+)"/g)?.map((m) => m.replace(/"/g, "")) || [];
    if (methods.includes("DELETE") || methods.includes("PATCH")) {
      findings.push({
        severity: "INFO",
        issue: "Destructive HTTP methods allowed via CORS",
        detail: `Methods: ${methods.join(", ")}. Verify intentional.`,
        remediation: `Review \`${svc}\` to confirm DELETE/PATCH are needed cross-origin.`,
      });
    }
  }

  if (origins.hasDevOrigins && !origins.hasEnvGuard) {
    findings.push({
      severity: "HIGH",
      issue: "Dev origins may leak into production",
      detail: "localhost origins not gated behind `NODE_ENV` check.",
      remediation: `Gate dev origins with \`NODE_ENV === 'development'\` in \`${svc}\`.`,
    });
  }

  return { serviceName, hasCors: true, origins, findings };
}

// ── Edge Router Analysis ───────────────────────────────────────────

/**
 * Pure: classifies the edge router's content into findings. No I/O — the
 * caller (`analyzeEdgeRouter()`) owns reading the file and handling the
 * "file not found" case.
 */
export function classifyEdgeRouterContent(content) {
  const findings = [];
  const presentHeaders = REQUIRED_HEADERS.filter((h) => content.includes(h));
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !content.includes(h));

  if (missingHeaders.length > 0) {
    const items = missingHeaders.map((h) => `- \`${h}\`: ${HEADER_ADVICE[h]}`).join("\n");
    findings.push({
      severity: "HIGH",
      issue: `Missing security headers (${missingHeaders.length})`,
      detail: `Missing: ${missingHeaders.map((h) => `\`${h}\``).join(", ")}`,
      remediation: `Add to \`buildSecurityHeaders()\` in edge-router.js:\n${items}`,
    });
  }

  const cspMatch = content.match(/Content-Security-Policy['"]\s*:\s*\[([\s\S]*?)\]\.join/);
  if (cspMatch) {
    const csp = cspMatch[1];
    if (csp.includes("'unsafe-inline'") && !csp.includes("nonce-")) {
      findings.push({
        severity: "HIGH",
        issue: "CSP `unsafe-inline` without nonce",
        detail: "Allows inline script injection.",
        remediation: "Use nonce-based CSP instead.",
      });
    }
    if (csp.includes("unsafe-eval")) {
      findings.push({
        severity: "CRITICAL",
        issue: "CSP allows dynamic code execution",
        detail: "Permits code injection via dynamic execution.",
        remediation: "Remove the unsafe directive from CSP in edge-router.js.",
      });
    }
  }

  if (content.match(/X-XSS-Protection['"]\s*:\s*['"]1/)) {
    findings.push({
      severity: "LOW",
      issue: "`X-XSS-Protection: 1` can introduce vulnerabilities",
      detail: "Modern best practice is `0`. CSP is the proper mitigation.",
      remediation: "Set `X-XSS-Protection: 0` in edge-router.js.",
    });
  }

  const connectSrc = content.match(/connect-src\s+([^;]+)/);
  if (connectSrc && connectSrc[1].includes("*")) {
    findings.push({
      severity: "HIGH",
      issue: "CSP `connect-src` allows wildcard",
      detail: "Allows connections to any origin.",
      remediation: "Use explicit origins.",
    });
  }

  if (content.match(/Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/)) {
    findings.push({
      severity: "CRITICAL",
      issue: "Edge router sets `Access-Control-Allow-Origin: *`",
      detail: "Overrides per-service CORS restrictions.",
      remediation: "Remove wildcard ACAO header; rely on per-service CORS.",
    });
  }

  return { findings, presentHeaders, missingHeaders };
}

/**
 * Pure: which of `files` DEFINES `buildSecurityHeaders`.
 *
 * The audit used to read `infrastructure/worker/edge-router.js` by hardcoded
 * path. `buildSecurityHeaders()` moved to `response-formatter.js`, which
 * edge-router.js merely imports — so the scan saw a file containing none of
 * the six required header names and filed a HIGH "Missing security headers"
 * every week against headers that were present, applied, and unit-tested
 * (#3769). Locating the definition instead of assuming its path means a
 * future move cannot resurrect that false positive.
 *
 * Matches a definition (`function buildSecurityHeaders`), never a mention —
 * an import line or a comment naming the function must not count, or the
 * scan would go on reading the wrong file.
 *
 * @param {string[]} files - Candidate paths.
 * @param {(path: string) => string} readFile
 * @returns {string | null} The defining path, or null if none defines it.
 */
export function findSecurityHeaderSource(files, readFile) {
  const DEFINITION = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+buildSecurityHeaders\b/;
  for (const file of files) {
    let content;
    try {
      content = readFile(file);
    } catch {
      continue;
    }
    if (DEFINITION.test(content)) return file;
  }
  return null;
}

/** I/O boundary: locates the module defining the security headers and delegates to the pure classifier. */
function analyzeEdgeRouter() {
  if (!existsSync(WORKER_DIR)) {
    return {
      findings: [
        {
          severity: "CRITICAL",
          issue: "Edge worker directory not found",
          detail: "Expected at `infrastructure/worker`.",
          remediation: "Verify the edge worker path.",
        },
      ],
      presentHeaders: [],
      missingHeaders: REQUIRED_HEADERS,
    };
  }

  const candidates = readdirSync(WORKER_DIR)
    .filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))
    .map((name) => resolve(WORKER_DIR, name));

  const source = findSecurityHeaderSource(candidates, (p) => readFileSync(p, "utf-8"));

  if (!source) {
    // Fail loud. Reporting "no findings" here would turn a scanner that can no
    // longer find the code it audits into a clean bill of health — the exact
    // direction this whole class of bug fails in.
    return {
      findings: [
        {
          severity: "CRITICAL",
          issue: "`buildSecurityHeaders()` not found in the edge worker",
          detail: "No file under `infrastructure/worker` defines `buildSecurityHeaders`.",
          remediation: "Point the audit at the module that now builds the security headers.",
        },
      ],
      presentHeaders: [],
      missingHeaders: REQUIRED_HEADERS,
    };
  }

  return classifyEdgeRouterContent(readFileSync(source, "utf-8"));
}

// ── Report ─────────────────────────────────────────────────────────

export function buildReport(serviceResults, edgeResult) {
  const allFindings = [
    ...serviceResults.flatMap((s) =>
      s.findings.map((f) => ({ ...f, source: `services/${s.serviceName}` }))
    ),
    ...edgeResult.findings.map((f) => ({ ...f, source: "edge-router.js" })),
  ];
  if (allFindings.length === 0) return null;

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const sorted = [...allFindings].sort(
    (a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5)
  );
  const count = (sev) => sorted.filter((f) => f.severity === sev).length;

  const lines = [
    "## Summary\n",
    "| Severity | Count |",
    "|----------|-------|",
    `| CRITICAL | ${count("CRITICAL")} |`,
    `| HIGH | ${count("HIGH")} |`,
    `| MEDIUM | ${count("MEDIUM")} |`,
    `| LOW/INFO | ${count("LOW") + count("INFO")} |`,
    "",
    "## Service CORS Overview\n",
    "| Service | CORS | Origins | Credentials | Env Override |",
    "|---------|------|---------|-------------|-------------|",
  ];

  for (const svc of serviceResults) {
    if (svc.hasCors) {
      const o = svc.origins;
      lines.push(
        `| ${svc.serviceName} | Yes | ${o.originCount} (${
          o.prodOrigins.length
        } prod, ${o.devOrigins.length} dev) | ${
          o.hasCredentials ? "Yes" : "No"
        } | ${o.usesEnvOverride ? "Yes" : "No"} |`
      );
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
    lines.push(
      `### [${f.severity}] ${f.issue}\n`,
      `**Source:** \`${f.source}\`\n`,
      `${f.detail}\n`,
      `**Remediation:** ${f.remediation}\n`,
      "---\n"
    );
  }
  lines.push("_Generated by `scripts/cors-audit.mjs` via GitHub Actions._");

  const title = `CORS audit: ${count("CRITICAL")} critical, ${count(
    "HIGH"
  )} high, ${count("MEDIUM") + count("LOW") + count("INFO")} other`;
  return { title, body: lines.join("\n") };
}

// ── Issue Creation ─────────────────────────────────────────────────

const CORS_AUDIT_TITLE_PATTERN = /^CORS audit:/;

/** dedupeKey fed to `fileIssue()`: this audit files one aggregate issue per
 * outstanding CORS problem set, not one per finding, so a single constant
 * key is enough to dedupe across runs (mirrors revert-watchdog's per-sha key,
 * just with no varying identity here). */
const CORS_AUDIT_DEDUPE_KEY = "cors-audit";

/**
 * Pure: finds a prior CORS audit issue among candidate issues (any state) by
 * title prefix. Feeds `fileIssue()`'s dedupe-by-ledger decision so a rerun
 * with no changes skips, and a rerun after the last one was closed reopens
 * it instead of filing a duplicate.
 *
 * @param {Array<{number: number, title: string}>} candidates
 * @returns {number | null}
 */
export function findPriorCorsAuditIssue(candidates) {
  const match = (candidates ?? []).find((issue) =>
    CORS_AUDIT_TITLE_PATTERN.test(issue?.title ?? "")
  );
  return match ? match.number : null;
}

/** Pure: the log line for a `fileIssue()` result, one per action. */
export function describeFilingResult(result, title) {
  if (result.action === "create") return `Created issue: ${title}`;
  if (result.action === "reopen") return `Reopened issue #${result.issueNumber}: ${title}`;
  return `Skipping — issue #${result.issueNumber} already tracks this: ${title}`;
}

/** Parses the issue number out of the URL `gh issue create` prints on success. */
function parseIssueNumberFromUrl(url) {
  const match = url.match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
}

/** Real `getIssueState` dep for `fileIssue()`, backed by `gh issue view`. */
function getIssueStateViaGhClient(ghClient, issueNumber) {
  try {
    const state = String(ghClient.issue.view(issueNumber, ["--json", "state"]).state).toLowerCase();
    return state === "open" ? "open" : state === "closed" ? "closed" : "missing";
  } catch {
    return "missing";
  }
}

function createGitHubIssue(ghClient, title, body) {
  const labels = getLabelsForSensor("cors");

  try {
    // A failed search must not swallow a genuine CORS finding — fail open
    // (treat as "no prior found", file the issue) rather than closed.
    // Title search (not a label filter) — the "audit" label is shared by
    // every audit-family producer, so a label-only search's default result
    // window can push an older CORS-audit issue out before it's ever seen.
    let candidates = [];
    try {
      candidates = ghClient.issue.list([
        "--search",
        "CORS audit in:title",
        "--state",
        "all",
        "--json",
        "number,title",
      ]);
    } catch (err) {
      console.error(`[cors-audit] search failed, proceeding as no-match: ${err.message}`);
    }
    const priorNumber = findPriorCorsAuditIssue(candidates);
    const ledger = priorNumber !== null ? { [CORS_AUDIT_DEDUPE_KEY]: priorNumber } : {};

    const result = fileIssue({ title, body, labels, dedupeKey: CORS_AUDIT_DEDUPE_KEY }, ledger, {
      getIssueState: (issueNumber) => getIssueStateViaGhClient(ghClient, issueNumber),
      createIssue: () =>
        parseIssueNumberFromUrl(
          ghClient.issue.create([
            "--title",
            title,
            ...labels.flatMap((l) => ["--label", l]),
            "--body",
            body,
          ])
        ),
      reopenIssue: (issueNumber) => ghClient.issue.reopen(issueNumber),
    });

    console.log(describeFilingResult(result, title));
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
  const serviceResults = services.map((s) =>
    parseCorsConfig(s.name, readFileSync(s.appPath, "utf-8"))
  );
  for (const r of serviceResults) {
    console.log(`  ${r.serviceName}: ${r.hasCors ? `${r.findings.length} finding(s)` : "no CORS"}`);
  }

  console.log("\nAnalyzing edge router...");
  const edgeResult = analyzeEdgeRouter();
  console.log(`  ${edgeResult.findings.length} finding(s)`);

  const report = buildReport(serviceResults, edgeResult);
  if (!report) {
    console.log("\nNo issues found.");
    return;
  }

  if (isDryRun) {
    console.log(`\n--- DRY RUN ---\n\n# ${report.title}\n\n${report.body}`);
    return;
  }
  createGitHubIssue(createGhClient(), report.title, report.body);
}

// Run when invoked directly (not imported by tests) — importing this module
// must never have side effects (#3676: an unguarded call here fired a real
// `main()` — GitHub search + issue create/reopen — the moment a test file
// imported the module for its pure functions).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("CORS audit failed:", err.message);
    process.exit(1);
  });
}
