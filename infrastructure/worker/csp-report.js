/**
 * POST /csp-report — records Content-Security-Policy violation reports (#8895).
 *
 * A CSP refusal is otherwise visible only in the browser: no 4xx, no log line,
 * no Sentry event (the zero-web-fonts outage, #4330, ran nine weeks that way).
 * csp.js points `report-uri` / `report-to` here; this module turns each report
 * into one structured log line and one `csp_reports` Analytics Engine point.
 *
 * Two wire formats:
 *   application/csp-report    legacy report-uri: {"csp-report": {...kebab-case}}
 *   application/reports+json  Reporting API: [{type: "csp-violation", body: {...camelCase}}]
 *
 * Everything here is untrusted browser input. The body is size-capped while it
 * streams, every recorded field is reduced to a bounded, allowlisted shape
 * (origin only for URLs, path only for the document, no query strings), and no
 * input is ever echoed into a response. Nothing in handleCspReport throws to
 * the caller — a throw from fetch() would reach the client as Cloudflare 1101.
 */

import { CSP_REPORTS_BINDING, toCspReportDataPoint } from "./analytics-schema.js";

export const CSP_REPORT_MAX_BYTES = 16 * 1024;

// Bounds per-request work and Analytics Engine writes; the Reporting API
// batches, but a real page never needs more than this in one POST.
const MAX_VIOLATIONS_PER_REQUEST = 20;
const MAX_PATH_LENGTH = 256;
const TOKEN_PATTERN = /^[a-z0-9-]{1,64}$/i;
const DISPOSITIONS = new Set(["enforce", "report"]);

const LEGACY_TYPE = "application/csp-report";
const REPORTING_TYPE = "application/reports+json";
// Some browsers send report-uri bodies as plain JSON; the shape decides.
const ACCEPTED_TYPES = new Set([LEGACY_TYPE, REPORTING_TYPE, "application/json"]);

function emptyResponse(status, headers = {}) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Read at most CSP_REPORT_MAX_BYTES of the body; null when it is larger. */
async function readCappedText(request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > CSP_REPORT_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.byteLength;
  }, 0);
  return new TextDecoder().decode(bytes);
}

function token(value) {
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;
}

function parseUrl(value) {
  if (typeof value !== "string" || value === "") return null;
  try {
    return new URL(value);
  } catch {
    return null; // not a URL — callers fall back to a keyword or a placeholder
  }
}

/** Origin for network URLs, scheme for data:/blob:, keyword for inline/eval. */
function blockedOriginOf(blocked) {
  if (blocked === "" || blocked === undefined || blocked === null) return "none";
  const url = parseUrl(blocked);
  if (url)
    return url.origin !== "null" ? url.origin : (token(url.protocol.slice(0, -1)) ?? "other");
  return token(blocked) ?? "other";
}

function documentPathOf(document) {
  const url = parseUrl(document);
  return url ? url.pathname.slice(0, MAX_PATH_LENGTH) : "unknown";
}

/** Reduce one raw violation to the four bounded fields we record. */
export function normalizeViolation({ directive, blocked, document, disposition }) {
  return {
    directive: token(directive) ?? "unknown",
    blockedOrigin: blockedOriginOf(blocked),
    documentPath: documentPathOf(document),
    disposition: DISPOSITIONS.has(disposition) ? disposition : "unknown",
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fromLegacy(report) {
  // effective-directive is CSP3; older browsers send only violated-directive,
  // whose first token is the directive name.
  const violated =
    typeof report["violated-directive"] === "string"
      ? report["violated-directive"].split(" ")[0]
      : undefined;
  return {
    directive: report["effective-directive"] ?? violated,
    blocked: report["blocked-uri"],
    document: report["document-uri"],
    disposition: report.disposition,
  };
}

function fromReportingApi(body) {
  return {
    directive: body.effectiveDirective,
    blocked: body.blockedURL,
    document: body.documentURL,
    disposition: body.disposition,
  };
}

/**
 * Raw violations from a parsed body, or null when the shape does not match
 * the declared media type. A Reporting API batch with no csp-violation entry
 * is valid and yields [].
 */
function extractViolations(mediaType, parsed) {
  if (mediaType !== REPORTING_TYPE && isObject(parsed) && isObject(parsed["csp-report"])) {
    return [fromLegacy(parsed["csp-report"])];
  }
  if (mediaType !== LEGACY_TYPE && Array.isArray(parsed)) {
    return parsed
      .filter((entry) => isObject(entry) && entry.type === "csp-violation" && isObject(entry.body))
      .slice(0, MAX_VIOLATIONS_PER_REQUEST)
      .map((entry) => fromReportingApi(entry.body));
  }
  return null;
}

function recordViolation(env, violation) {
  // console.info, not console.log: the worker's no-console rule allows only
  // info/warn/error. Workers Logs captures it identically.
  console.info(JSON.stringify({ event: "csp-violation", ...violation }));
  const analytics = env[CSP_REPORTS_BINDING];
  if (!analytics) return;
  try {
    analytics.writeDataPoint(toCspReportDataPoint(violation));
  } catch (error) {
    // Telemetry must never fail the request — same fail-open shape as
    // writeAnalytics() in edge-router.js.
    console.error("CSP report analytics write failed:", error.message);
  }
}

async function processReport(request, env) {
  if (request.method !== "POST") return emptyResponse(405, { Allow: "POST" });

  const mediaType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.has(mediaType)) return emptyResponse(415);

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (declaredLength > CSP_REPORT_MAX_BYTES) return emptyResponse(413);

  const text = await readCappedText(request);
  if (text === null) return emptyResponse(413);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyResponse(400); // unparseable report — nothing to record
  }

  const violations = extractViolations(mediaType, parsed);
  if (violations === null) return emptyResponse(400);

  violations.map(normalizeViolation).forEach((violation) => recordViolation(env, violation));
  return emptyResponse(204);
}

/**
 * Handle a request to /csp-report. Always resolves to a Response: 204 on
 * success, 4xx for anything malformed or unexpected. Never proxied.
 */
export async function handleCspReport(request, env) {
  try {
    return await processReport(request, env);
  } catch (error) {
    console.error("CSP report handling failed:", error.message);
    return emptyResponse(400);
  }
}
