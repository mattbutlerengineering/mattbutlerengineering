/**
 * detect-judged.mjs — the pure core of `detect.mjs judged`
 * (docs/features/ui-quality-loop/architecture.md § Interfaces
 * `detect.mjs mechanical | judged` and "Judge").
 *
 * The model writes `.ui-quality/judged/<app>.json` in the Judge schema
 * `{ app, rubric_version, model_id, routes: [{ route, tells: [{ tell,
 * evidence, severity }] } | { route, unjudged: "tool-error" }] }`. Nothing it
 * writes is trusted until this has read it. The model seam degrades, it never
 * exits:
 *
 *   judgeable route absent from the file      → unjudged:missing
 *   entry failing the schema                  → unjudged:malformed
 *   `{ route, unjudged: <reason> }`           → unjudged:<reason>
 *   unparseable file / wrong rubric_version   → every judgeable route of the app unjudged:malformed
 *   unknown tell, non-`judged` tell,          → dropped: one log line + one `dropped[]` entry;
 *   or an entry for a route not captured        the route stays judged (`tells: []` = judged clean)
 *
 * A judgeable route is a manifest row with at least one screenshot; an
 * errored row without one is `ledger.mjs record`'s `unreachable:build` and is
 * never listed. Severity is always the tell's `default_severity` — never the
 * model's — so P1 stays mechanical.
 */

import { tellsById } from "./rubric.mjs";

export const JUDGED_DIR = "judged";
export const JUDGED_FINDINGS_FILE = "findings.judged.json";
export const JUDGE_STATUS_FILE = "judge-status.json";
const UNJUDGED_REASONS = ["tool-error", "malformed", "missing"];

const isString = (v) => typeof v === "string" && v !== "";

function validTellEntry(t) {
  return t !== null && typeof t === "object" && isString(t.tell) && typeof t.evidence === "string";
}

/** "tells" | "unjudged" | null (schema failure) */
function entryShape(entry) {
  if (Array.isArray(entry.tells) && entry.unjudged === undefined) {
    return entry.tells.every(validTellEntry) ? "tells" : null;
  }
  if (entry.tells === undefined && UNJUDGED_REASONS.includes(entry.unjudged)) return "unjudged";
  return null;
}

/** The parsed file, or null when it is unparseable or not this app's Judge file at the rubric's version. */
function parseJudgedFile(raw, app, rubricVersion) {
  let file = raw;
  if (typeof raw === "string") {
    try {
      file = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const ok =
    file !== null &&
    typeof file === "object" &&
    file.app === app &&
    file.rubric_version === rubricVersion &&
    Array.isArray(file.routes);
  return ok ? file : null;
}

function judgeApp(app, rows, raw, ctx) {
  const shots = new Map(
    rows.filter((r) => r.screenshots.length > 0).map((r) => [r.route, r.screenshots])
  );
  const routes = Object.fromEntries([...shots.keys()].map((route) => [route, "unjudged:missing"]));
  if (raw === undefined) return { routes, findings: [] };
  const file = parseJudgedFile(raw, app, ctx.rubric.rubric_version);
  if (file === null) {
    ctx.log(
      `detect.mjs judged: ${app}: judged file unparseable or not rubric v${ctx.rubric.rubric_version} — every route unjudged:malformed\n`
    );
    return {
      routes: Object.fromEntries([...shots.keys()].map((r) => [r, "unjudged:malformed"])),
      findings: [],
    };
  }
  const findings = [];
  const drop = (route, tell, reason) => {
    ctx.dropped.push({ app, route, tell, reason });
    ctx.log(`detect.mjs judged: ${app} ${route}: dropped ${tell ?? "entry"} (${reason})\n`);
  };
  const seen = new Set();
  for (const entry of file.routes) {
    const route = entry?.route;
    if (!isString(route)) continue; // no route to attribute it to; the route itself reads missing
    if (!shots.has(route)) {
      drop(route, null, "unknown-route");
      continue;
    }
    const shape = seen.has(route) ? null : entryShape(entry);
    seen.add(route);
    if (shape === null) routes[route] = "unjudged:malformed";
    else if (shape === "unjudged") routes[route] = `unjudged:${entry.unjudged}`;
    else {
      routes[route] = "judged";
      findings.push(...judgedTells(app, route, entry.tells, shots.get(route), ctx, drop));
    }
  }
  return { routes, findings };
}

function judgedTells(app, route, tells, screenshots, ctx, drop) {
  const out = new Map();
  for (const t of tells) {
    const known = ctx.tells.get(t.tell);
    if (!known) drop(route, t.tell, "unknown-tell");
    else if (known.detection !== "judged") drop(route, t.tell, "not-judged-detection");
    else if (!out.has(t.tell)) {
      out.set(t.tell, {
        app,
        route,
        tell: t.tell,
        severity: known.default_severity,
        evidence: {
          message: t.evidence,
          screenshot_sha256: screenshots[0].sha256,
          screenshot_sha256s: screenshots.map((s) => s.sha256),
        },
      });
    }
  }
  return [...out.values()];
}

const byKey = (a, b) => {
  const ka = `${a.app}|${a.route}|${a.tell}`;
  const kb = `${b.app}|${b.route}|${b.tell}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/**
 * @param {{ manifests: Record<string, object[]>, judged: Record<string, object|string>,
 *           rubric: object, log?: (line: string) => void }} input
 *   `judged[app]` is the parsed Judge file, its raw text if unparseable, or absent.
 * @returns {{ findings: object[], status: { routes: object, dropped: object[] } }}
 */
export function judgedFindings({ manifests, judged, rubric, log = () => {} }) {
  const ctx = { rubric, tells: tellsById(rubric), dropped: [], log };
  const routes = {};
  const findings = [];
  for (const [app, rows] of Object.entries(manifests)) {
    const result = judgeApp(app, rows, judged[app], ctx);
    routes[app] = result.routes;
    findings.push(...result.findings);
  }
  return { findings: findings.sort(byKey), status: { routes, dropped: ctx.dropped } };
}
