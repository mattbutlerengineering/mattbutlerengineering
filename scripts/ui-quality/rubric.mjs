#!/usr/bin/env node
/**
 * rubric.mjs — load, validate and hash the versioned bar
 * (docs/features/ui-quality-loop/architecture.md § Components "Rubric").
 *
 * `docs/ui-quality/rubric.json` is the machine half (version, tells_hash,
 * tells, references, route categories, calibration pass mark);
 * `docs/ui-quality/rubric.md` is the prose the judge reads, one
 * `### <tell-id>` per tell. Only a human bumps `rubric_version` — the
 * tells-hash guard (`validateRubric`) fails whenever a tell's id, detection or
 * severity changes without `tells_hash` being recomputed, which is the moment
 * a reviewer is forced to ask "is this a new version?".
 *
 * Subcommands:
 *   check  validate the committed rubric; exit 1 with every error listed
 *   hash   print the tells_hash the committed tells imply (paste it after an edit)
 *
 * Usage: node scripts/ui-quality/rubric.mjs <check|hash> [--root <dir>]
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RUBRIC_FILE = "docs/ui-quality/rubric.json";
export const RUBRIC_PROSE_FILE = "docs/ui-quality/rubric.md";

export const FACES = ["bugs", "agent-built", "navigation", "accessibility"];
export const DETECTIONS = ["mechanical", "judged"];
export const SEVERITIES = ["P1", "P2"];
export const CATEGORIES = [
  "marketing-site",
  "booking-checkout",
  "product-dashboard",
  "component-docs",
  "harness",
];

/** sha256 over the sorted `id|detection|default_severity` lines — references are not hashed. */
export function hashTells(tells) {
  const lines = tells.map((t) => `${t.id}|${t.detection}|${t.default_severity}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

function tellErrors(tells) {
  const errors = [];
  const seen = new Set();
  for (const t of tells) {
    const where = `tell ${JSON.stringify(t.id)}`;
    if (typeof t.id !== "string" || !/^[a-z-]+\/[a-z0-9-]+$/.test(t.id)) {
      errors.push(`${where}: id must be <face>/<slug>`);
    }
    if (seen.has(t.id)) errors.push(`${where}: duplicate id`);
    seen.add(t.id);
    if (!FACES.includes(t.face)) errors.push(`${where}: face must be one of ${FACES.join("|")}`);
    if (!DETECTIONS.includes(t.detection)) {
      errors.push(`${where}: detection must be one of ${DETECTIONS.join("|")}`);
    }
    if (!SEVERITIES.includes(t.default_severity)) {
      errors.push(`${where}: default_severity must be one of ${SEVERITIES.join("|")}`);
    }
    if (t.detection === "judged" && t.default_severity === "P1") {
      errors.push(`${where}: a judged tell cannot default to P1 — P1 is mechanical only`);
    }
    if (t.axe_rules !== undefined && !Array.isArray(t.axe_rules)) {
      errors.push(`${where}: axe_rules must be an array`);
    }
  }
  return errors;
}

function categoryErrors(routeCategories) {
  if (!Array.isArray(routeCategories) || routeCategories.length === 0) {
    return ["route_categories must be a non-empty array"];
  }
  return routeCategories
    .filter((c) => typeof c.app !== "string" || typeof c.pattern !== "string")
    .map((c) => `route_categories entry ${JSON.stringify(c)}: needs app and pattern`)
    .concat(
      routeCategories
        .filter((c) => !CATEGORIES.includes(c.category))
        .map((c) => `route_categories entry ${JSON.stringify(c)}: unknown category`)
    );
}

/** @returns {string[]} every problem found; empty means valid */
export function validateRubric(rubric) {
  const errors = [];
  if (!Number.isInteger(rubric?.rubric_version) || rubric.rubric_version < 1) {
    errors.push("rubric_version must be a positive integer");
  }
  if (!Array.isArray(rubric?.tells) || rubric.tells.length === 0) {
    return [...errors, "tells must be a non-empty array"];
  }
  errors.push(...tellErrors(rubric.tells));
  const expected = hashTells(rubric.tells);
  if (rubric.tells_hash !== expected) {
    errors.push(
      `tells_hash ${rubric.tells_hash} ≠ ${expected} — a tell changed; recompute it (rubric.mjs hash) and decide whether rubric_version must bump`
    );
  }
  if (!Array.isArray(rubric.references)) errors.push("references must be an array");
  errors.push(...categoryErrors(rubric.route_categories));
  const mark = rubric.calibration?.pass_mark;
  if (typeof mark?.agreement !== "number" || !Number.isInteger(mark?.inversions)) {
    errors.push("calibration.pass_mark must be { agreement: number, inversions: integer }");
  }
  return errors;
}

/** Read + validate; throws with every error when the rubric is unusable. */
export function loadRubric(root = DEFAULT_ROOT) {
  const rubric = JSON.parse(readFileSync(join(root, RUBRIC_FILE), "utf8"));
  const errors = validateRubric(rubric);
  if (errors.length > 0) throw new Error(`${RUBRIC_FILE} is invalid:\n  ${errors.join("\n  ")}`);
  return rubric;
}

/** @returns {Map<string, object>} tell id → tell */
export function tellsById(rubric) {
  return new Map(rubric.tells.map((t) => [t.id, t]));
}

const stripSlash = (route) => (route === "/" ? "/" : route.replace(/^\//, ""));

/**
 * The category of an app's route: the first `route_categories` entry whose
 * `app` matches and whose `pattern` is `*`, the route itself, or a `prefix/*`
 * the route falls under. Leading slashes are ignored on both sides.
 * @returns {string|null}
 */
export function categoryOf(rubric, app, route) {
  const r = stripSlash(route);
  const hit = rubric.route_categories.find((c) => {
    if (c.app !== app) return false;
    const p = stripSlash(c.pattern);
    if (p === "*" || p === r) return true;
    return p.endsWith("/*") && r.startsWith(p.slice(0, -1));
  });
  return hit ? hit.category : null;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function check(ctx) {
  const rubric = JSON.parse(readFileSync(join(ctx.root, RUBRIC_FILE), "utf8"));
  const errors = validateRubric(rubric);
  if (errors.length === 0) {
    ctx.stdout(`PASS: ${RUBRIC_FILE} v${rubric.rubric_version} (${rubric.tells.length} tells)\n`);
    return 0;
  }
  ctx.stdout(`FAIL: ${RUBRIC_FILE}\n  ${errors.join("\n  ")}\n`);
  return 1;
}

function hash(ctx) {
  const rubric = JSON.parse(readFileSync(join(ctx.root, RUBRIC_FILE), "utf8"));
  ctx.stdout(`${hashTells(rubric.tells)}\n`);
  return 0;
}

const COMMANDS = { check, hash };

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
    ctx.stderr(`Usage: rubric.mjs <${Object.keys(COMMANDS).join("|")}> [--root <dir>]\n`);
    return 2;
  }
  try {
    return command(ctx);
  } catch (err) {
    ctx.stderr(`rubric.mjs ${argv[0]}: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
