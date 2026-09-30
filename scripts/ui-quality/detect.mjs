#!/usr/bin/env node
/**
 * detect.mjs — the only `Finding[]` producer of the ui-quality loop
 * (docs/features/ui-quality-loop/architecture.md § Components "Mechanical
 * detectors", § Interfaces `detect.mjs mechanical | judged`).
 *
 * Subcommands:
 *   mechanical  capture manifests + ledger route set + rubric →
 *               .ui-quality/findings.mechanical.json — findings a script can
 *               prove: blank render, unhandled error, dead in-app link, failed
 *               request, and one `accessibility/axe-<impact>` per impact seen
 *   judged      the model's .ui-quality/judged/<app>.json, validated against
 *               the rubric + manifests → .ui-quality/findings.judged.json and
 *               .ui-quality/judge-status.json
 *
 * Finding: { app, route, tell, severity, evidence: { selector?, message?,
 * href?, screenshot_sha256 } } — one per (app, route, tell), sorted, severity
 * always the tell's `default_severity` in rubric.json. Never judges: nothing
 * here reads a pixel. Exit 2 only when a manifest or the rubric is missing or
 * unreadable, or (mechanical) the edge topology cannot be joined to the ledger.
 *
 * Dead-link ownership follows the edge route table (edge-topology.mjs): each
 * collected app-relative link is made absolute with the capturing app's mount,
 * assigned to the deployed app that serves it, and matched against THAT app's
 * templates with the mount stripped. A link served by a deployed app with no
 * ledger rows is out of inventory — one log line, no finding. A link also
 * resolves when it names a file under the owning app's `public/` directory
 * (Vite serves it at the app's mount), and a page's own path is never a dead
 * link to itself (the `*` capture at its not-found URL).
 *
 * Usage: node scripts/ui-quality/detect.mjs <mechanical|judged> [--root <dir>]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "../metrics-store.mjs";
import { BLANK_MIN_PAINTED_RATIO, BLANK_MIN_TEXT_CHARS } from "./config.mjs";
import {
  JUDGE_STATUS_FILE,
  JUDGED_DIR,
  JUDGED_FINDINGS_FILE,
  judgedFindings,
} from "./detect-judged.mjs";
import {
  joinEdgeTopology,
  mountFor,
  prefixOf,
  readEdgeTopology,
  stripMount,
} from "./edge-topology.mjs";
import { LEDGER_METRIC, WORK_DIR, parseLedger } from "./ledger.mjs";
import { loadRubric, tellsById } from "./rubric.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAPTURES_DIR = "captures";
export const MECHANICAL_FILE = "findings.mechanical.json";

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

const segments = (path) => path.split("/").filter((s) => s !== "");

/**
 * Does an app-relative link path match a router template? `:param` matches
 * one segment; a trailing `*` matches the rest (zero or more segments).
 */
export function matchesTemplate(linkPath, template) {
  const link = segments(linkPath);
  const tmpl = segments(template);
  const splat = tmpl.at(-1) === "*";
  const fixed = splat ? tmpl.slice(0, -1) : tmpl;
  if (splat ? link.length < fixed.length : link.length !== fixed.length) return false;
  return fixed.every((seg, i) => seg.startsWith(":") || seg === link[i]);
}

/** Every template of the app a link may land on — the bare catch-all `*` excluded. */
function templatesByApp(ledger) {
  const byApp = new Map();
  for (const row of ledger) {
    if (row.route === "*") continue;
    byApp.set(row.app, [...(byApp.get(row.app) ?? []), row.route]);
  }
  return byApp;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The links on one captured page that no template and no static asset of their
 * serving app matches. Links served by an app outside the ledger are logged
 * and skipped; the page's own path is never dead to itself.
 */
function deadLinks(row, { app, templates, staticAssets, topology, log }) {
  const dead = [];
  for (const link of row.links) {
    if (link === row.path) continue;
    const absolute = `${prefixOf(topology, app)}${link}`;
    const mount = mountFor(topology, absolute);
    if (mount.app === null) {
      log(
        `detect.mjs mechanical: out of inventory — ${app} ${row.route} links ${absolute} (mount ${mount.prefix} → apps/${mount.dir}); no finding\n`
      );
      continue;
    }
    const local = stripMount(mount, absolute);
    if ((staticAssets[mount.app] ?? []).includes(local)) continue;
    if (!(templates.get(mount.app) ?? []).some((t) => matchesTemplate(local, t))) dead.push(link);
  }
  return dead;
}

/** Raw detections for one manifest row: [{ tell, evidence }] before severity is attached. */
function detectRow(row, context) {
  const hits = [];
  if (
    row.blank.text_chars < BLANK_MIN_TEXT_CHARS ||
    row.blank.painted_ratio < BLANK_MIN_PAINTED_RATIO
  ) {
    hits.push({
      tell: "bugs/blank-render",
      evidence: {
        message: `main landmark has ${plural(row.blank.text_chars, "text char")}, painted ratio ${row.blank.painted_ratio}`,
      },
    });
  }
  if (row.page_errors.length > 0) {
    hits.push({
      tell: "bugs/unhandled-error",
      evidence: {
        message: `${plural(row.page_errors.length, "uncaught error")}: ${row.page_errors.join(" | ")}`,
      },
    });
  }
  const dead = deadLinks(row, context);
  if (dead.length > 0) {
    hits.push({
      tell: "bugs/dead-in-app-link",
      evidence: {
        href: dead[0],
        message: `${plural(dead.length, "dead in-app link")}: ${dead.join(", ")}`,
      },
    });
  }
  if (row.failed_requests.length > 0) {
    const [first] = row.failed_requests;
    hits.push({
      tell: "bugs/failed-request",
      evidence: {
        href: first.url,
        message: `${plural(row.failed_requests.length, "failed request")}: ${row.failed_requests
          .map((r) => `${r.url} (${r.reason})`)
          .join(", ")}`,
      },
    });
  }
  hits.push(...axeHits(row.axe.violations));
  return hits;
}

/** One hit per axe impact level, citing every rule at that level and the first node. */
function axeHits(violations) {
  const byImpact = new Map();
  for (const v of violations) {
    const impact = v.impact ?? "minor";
    byImpact.set(impact, [...(byImpact.get(impact) ?? []), v]);
  }
  return [...byImpact].map(([impact, vs]) => ({
    tell: `accessibility/axe-${impact}`,
    evidence: {
      selector: [vs[0].nodes[0]?.target ?? []].flat().join(" "),
      message: vs.map((v) => `${v.id} (${plural(v.nodes.length, "node")})`).join(", "),
    },
  }));
}

const byKey = (a, b) => {
  const ka = `${a.app}|${a.route}|${a.tell}`;
  const kb = `${b.app}|${b.route}|${b.tell}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/**
 * @param {{ manifests: Record<string, object[]>, ledger: object[], rubric: object,
 *   topology: { mounts: object[] }, staticAssets?: Record<string, string[]>,
 *   log?: (line: string) => void }} input
 *   topology — `joinEdgeTopology`'s result; staticAssets — `readStaticAssets`'s result
 * @returns {object[]} Finding[] — mechanical tells only, sorted by (app, route, tell)
 */
export function mechanicalFindings({
  manifests,
  ledger,
  rubric,
  topology,
  staticAssets = {},
  log = () => {},
}) {
  const tells = tellsById(rubric);
  const templates = templatesByApp(ledger);
  const findings = [];
  for (const [app, rows] of Object.entries(manifests)) {
    for (const row of rows) {
      // An errored row with no screenshots was never rendered: it is the
      // ledger's unreachable:build, not a finding.
      if (row.screenshots.length === 0) continue;
      for (const hit of detectRow(row, { app, templates, staticAssets, topology, log })) {
        const tell = tells.get(hit.tell);
        if (tell?.detection !== "mechanical") {
          throw new Error(`rubric has no mechanical tell ${hit.tell}`);
        }
        findings.push({
          app,
          route: row.route,
          tell: hit.tell,
          severity: tell.default_severity,
          evidence: { ...hit.evidence, screenshot_sha256: row.screenshots[0].sha256 },
        });
      }
    }
  }
  return findings.sort(byKey);
}

// ---------------------------------------------------------------------------
// Shared I/O
// ---------------------------------------------------------------------------

/** app → manifest rows. Throws (→ exit 2) when there is no manifest at all or a line is unreadable. */
export function readManifests(root) {
  const dir = join(root, WORK_DIR, CAPTURES_DIR);
  const apps = existsSync(dir)
    ? readdirSync(dir)
        .filter((app) => existsSync(join(dir, app, "manifest.jsonl")))
        .sort()
    : [];
  if (apps.length === 0) throw new Error(`no capture manifest under ${WORK_DIR}/${CAPTURES_DIR}/`);
  return Object.fromEntries(
    apps.map((app) => {
      const file = join(dir, app, "manifest.jsonl");
      try {
        return [app, parseLedger(readFileSync(file, "utf8"))];
      } catch (err) {
        throw new Error(`${file} is unreadable: ${err.message}`, { cause: err });
      }
    })
  );
}

/** Every file under `dir`, as `/`-rooted paths relative to it. */
function filesUnder(dir, base = "") {
  return readdirSync(join(dir, base), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(dir, `${base}/${e.name}`) : [`${base}/${e.name}`]
  );
}

/**
 * ledger app → the app-relative paths of every file in its `apps/<dir>/public/`
 * (resolved from the mount's `dir`; an app with no `public/` has none).
 */
export function readStaticAssets(root, topology) {
  return Object.fromEntries(
    topology.mounts
      .filter((m) => m.app !== null)
      .map((m) => {
        const dir = join(root, "apps", m.dir, "public");
        return [m.app, existsSync(dir) ? filesUnder(dir).sort() : []];
      })
  );
}

export function writeWorkJson(root, file, value) {
  const path = join(root, WORK_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function mechanical(ctx) {
  const rubric = loadRubric(ctx.root);
  const manifests = readManifests(ctx.root);
  const ledger = parseLedger(readFileSync(resolvePath(LEDGER_METRIC, { root: ctx.root }), "utf8"));
  const ledgerApps = [...new Set(ledger.map((r) => r.app))].sort();
  const topology = joinEdgeTopology(readEdgeTopology(ctx.root), ledgerApps);
  const staticAssets = readStaticAssets(ctx.root, topology);
  const findings = mechanicalFindings({
    manifests,
    ledger,
    rubric,
    topology,
    staticAssets,
    log: ctx.stderr,
  });
  writeWorkJson(ctx.root, MECHANICAL_FILE, findings);
  ctx.stderr(
    `detect.mjs mechanical: ${findings.length} findings → ${WORK_DIR}/${MECHANICAL_FILE}\n`
  );
  return 0;
}

/** app → the model's raw Judge file text, for every app that has one. */
function readJudged(root, apps) {
  const dir = join(root, WORK_DIR, JUDGED_DIR);
  return Object.fromEntries(
    apps
      .filter((app) => existsSync(join(dir, `${app}.json`)))
      .map((app) => [app, readFileSync(join(dir, `${app}.json`), "utf8")])
  );
}

function judged(ctx) {
  const rubric = loadRubric(ctx.root);
  const manifests = readManifests(ctx.root);
  const { findings, status } = judgedFindings({
    manifests,
    judged: readJudged(ctx.root, Object.keys(manifests)),
    rubric,
    log: ctx.stderr,
  });
  writeWorkJson(ctx.root, JUDGED_FINDINGS_FILE, findings);
  writeWorkJson(ctx.root, JUDGE_STATUS_FILE, status);
  const unjudged = Object.values(status.routes)
    .flatMap((r) => Object.values(r))
    .filter((v) => v !== "judged").length;
  ctx.stderr(
    `detect.mjs judged: ${findings.length} findings, ${unjudged} unjudged, ${status.dropped.length} dropped → ${WORK_DIR}/${JUDGED_FINDINGS_FILE}, ${WORK_DIR}/${JUDGE_STATUS_FILE}\n`
  );
  return 0;
}

const COMMANDS = { mechanical, judged };

/**
 * @param {string[]} argv
 * @param {object} [deps] root, stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const rootFlag = argv.indexOf("--root");
  const ctx = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
    root: rootFlag !== -1 ? resolve(argv[rootFlag + 1]) : (deps.root ?? DEFAULT_ROOT),
  };
  const command = COMMANDS[argv[0]];
  if (!command) {
    ctx.stderr(`Usage: detect.mjs <${Object.keys(COMMANDS).join("|")}> [--root <dir>]\n`);
    return 2;
  }
  try {
    return command(ctx);
  } catch (err) {
    ctx.stderr(`detect.mjs ${argv[0]}: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
