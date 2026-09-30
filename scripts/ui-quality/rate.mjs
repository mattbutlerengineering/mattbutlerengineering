#!/usr/bin/env node
/**
 * rate.mjs — the taste rater's record, not its judgement
 * (docs/features/ui-quality-loop/architecture.md § Components "Taste rater",
 * § Interfaces `rate.mjs pairs | record | calibrate`).
 *
 *   pairs   read the capture manifests + rubric, write `.ui-quality/rating-plan.json`:
 *           per app, TASTE_SAMPLE_ROUTES taste-eligible captured routes ×
 *           TASTE_REFERENCES_PER_ROUTE references of the same category. `harness`
 *           routes are never sampled. Which image is "A" is decided by the parity of
 *           sha256(pair key), so a re-run reproduces the plan byte for byte.
 *   record  validate the model's verdicts (`[{ pair_id, verdict: "A"|"B"|"tie",
 *           tells, note }]`) against the plan and append one row per app to
 *           `metrics/ui-quality-ratings.jsonl`.
 *
 * The model seam degrades past a bad part, never past a bad unit: a tell id the
 * rubric lacks, or whose `detection` is not `judged`, is dropped, logged and
 * counted (`dropped_tells`) and the verdict stands; a missing verdict, a pair id
 * not in the plan, or a malformed verdict exits 2 and appends nothing — a partial
 * score is a wrong score. Only pairwise preferences are recorded; an absolute
 * single-answer score is never produced.
 *
 * Exit codes: 0 ok, 2 bad input.
 *
 * Usage: node scripts/ui-quality/rate.mjs <pairs|record> [--verdicts <file>]
 *          [--model-id <id>] [--root <dir>]
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { append } from "../metrics-store.mjs";
import { TASTE_REFERENCES_PER_ROUTE, TASTE_SAMPLE_ROUTES } from "./config.mjs";
import { categoryOf, loadRubric, tellsById } from "./rubric.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RATINGS_METRIC = "ui-quality-ratings";
export const WORK_DIR = ".ui-quality";
export const RATING_PLAN_FILE = "rating-plan.json";
export const ROUTINE_DOC = "docs/routines/mbe-ui-quality.md";
const CAPTURES_DIR = "captures";
/** The viewport pairs are judged at — the one the references were captured at. */
const PAIR_VIEWPORT = "1280x720";
const VERDICTS = ["A", "B", "tie"];
const OUTCOME_VALUE = { ours: 1, tie: 0.5, reference: 0 };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/** "AB" (ours is A) when sha256(key)'s first byte is even, else "BA". */
export function positionOf(key) {
  return parseInt(sha256(key).slice(0, 2), 16) % 2 === 0 ? "AB" : "BA";
}

/** 5 × mean over outcomes `ours` (1) | `tie` (0.5) | `reference` (0). */
export function scoreOf(outcomes) {
  const total = outcomes.reduce((sum, o) => sum + OUTCOME_VALUE[o], 0);
  return (5 * total) / outcomes.length;
}

/** Deterministic "first n by sha256(salt + id)" — a stable sample with no RNG. */
function sampleBy(items, n, keyOf) {
  return [...items]
    .map((item) => ({ item, h: sha256(keyOf(item)) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .slice(0, n)
    .map(({ item }) => item);
}

function pairFor(app, row, shot, ref) {
  const key = `${app}|${row.route}|${PAIR_VIEWPORT}|${ref.id}`;
  const ours = {
    route: row.route,
    viewport: PAIR_VIEWPORT,
    sha256: shot.sha256,
    path: `${WORK_DIR}/${CAPTURES_DIR}/${app}/${shot.file}`,
  };
  const reference = { id: ref.id, sha256: ref.sha256, path: ref.file };
  const position = positionOf(key);
  const [a, b] = position === "AB" ? [ours, reference] : [reference, ours];
  return {
    id: `p-${sha256(key).slice(0, 12)}`,
    app,
    key,
    position,
    a: { path: a.path, sha256: a.sha256 },
    b: { path: b.path, sha256: b.sha256 },
    ours,
    reference,
  };
}

/**
 * @param {{ rubric: object, manifests: Record<string, object[]> }} input
 * @returns {object[]} planned pairs, apps in sorted order
 */
export function buildPairs({ rubric, manifests }) {
  const refsByCategory = Map.groupBy(rubric.references, (r) => r.category);
  return Object.keys(manifests)
    .sort()
    .flatMap((app) => {
      const eligible = manifests[app].flatMap((row) => {
        const shot = (row.screenshots ?? []).find((s) => s.viewport === PAIR_VIEWPORT);
        const refs = refsByCategory.get(categoryOf(rubric, app, row.route)) ?? [];
        // `harness` has no references by construction, so it can never be sampled.
        return shot && refs.length > 0 ? [{ row, shot, refs }] : [];
      });
      return sampleBy(eligible, TASTE_SAMPLE_ROUTES, (e) => `${app}|${e.row.route}`).flatMap(
        ({ row, shot, refs }) =>
          sampleBy(refs, TASTE_REFERENCES_PER_ROUTE, (r) => `${app}|${row.route}|${r.id}`).map(
            (ref) => pairFor(app, row, shot, ref)
          )
      );
    });
}

/** ours | tie | reference, from the verdict and which side ours was on. */
function outcomeOf(pair, verdict) {
  if (verdict === "tie") return "tie";
  return (verdict === "A") === (pair.position === "AB") ? "ours" : "reference";
}

/**
 * Validate verdicts against the plan. Unit failures are returned as `errors`
 * (the caller exits 2); tell-level failures are dropped into `dropped`.
 */
export function validateVerdicts(plan, verdicts, rubric) {
  if (!Array.isArray(verdicts)) return { errors: ["verdicts must be a JSON array"] };
  const planned = new Map(plan.pairs.map((p) => [p.id, p]));
  const tells = tellsById(rubric);
  const errors = [];
  const dropped = [];
  const byId = new Map();
  for (const v of verdicts) {
    const id = v?.pair_id;
    if (!planned.has(id)) errors.push(`verdict for ${JSON.stringify(id)}: pair not in the plan`);
    else if (byId.has(id)) errors.push(`verdict for ${id}: duplicate`);
    else if (!VERDICTS.includes(v.verdict))
      errors.push(`verdict for ${id}: verdict must be A|B|tie`);
    else if (v.tells !== undefined && !Array.isArray(v.tells))
      errors.push(`verdict for ${id}: tells must be an array`);
    else {
      const kept = (v.tells ?? []).filter((t) => {
        const ok = tells.get(t)?.detection === "judged";
        if (!ok) dropped.push({ app: planned.get(id).app, pair_id: id, tell: t });
        return ok;
      });
      byId.set(id, { ...v, tells: kept });
    }
  }
  for (const id of planned.keys()) {
    if (!byId.has(id) && !verdicts.some((v) => v?.pair_id === id))
      errors.push(`verdict for ${id}: missing`);
  }
  return { errors, dropped, byId };
}

/** One ratings row per app in the plan, pairs in plan order. */
export function ratingRows(plan, byId, dropped, { ts, modelId }) {
  const apps = [...new Set(plan.pairs.map((p) => p.app))];
  return apps.map((app) => {
    const pairs = plan.pairs
      .filter((p) => p.app === app)
      .map((p) => {
        const v = byId.get(p.id);
        return {
          id: p.id,
          ours: p.ours,
          reference: p.reference,
          position: p.position,
          verdict: v.verdict,
          tells: v.tells,
          note: typeof v.note === "string" ? v.note : "",
        };
      });
    return {
      ts,
      app,
      rubric_version: plan.rubric_version,
      model_id: modelId,
      score: Math.round(scoreOf(pairs.map((p) => outcomeOf(p, p.verdict))) * 100) / 100,
      dropped_tells: dropped.filter((d) => d.app === app).length,
      pairs,
    };
  });
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function readManifests(work) {
  const dir = join(work, CAPTURES_DIR);
  if (!existsSync(dir)) return {};
  const manifests = {};
  for (const app of readdirSync(dir)) {
    const file = join(dir, app, "manifest.jsonl");
    if (!existsSync(file)) continue;
    manifests[app] = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l));
  }
  return manifests;
}

/** `model:` from the routine doc's frontmatter, or null. */
function routineModelId(root) {
  const file = join(root, ROUTINE_DOC);
  if (!existsSync(file)) return null;
  const front = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
  return front?.[1].match(/^model:\s*(\S+)\s*$/m)?.[1] ?? null;
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function pairsCommand(ctx) {
  const rubric = loadRubric(ctx.root);
  const work = join(ctx.root, WORK_DIR);
  const pairs = buildPairs({ rubric, manifests: readManifests(work) });
  mkdirSync(work, { recursive: true });
  const plan = { rubric_version: rubric.rubric_version, pairs };
  writeFileSync(join(work, RATING_PLAN_FILE), JSON.stringify(plan, null, 2) + "\n");
  const apps = new Set(pairs.map((p) => p.app)).size;
  ctx.stdout(
    `rate.mjs pairs: ${pairs.length} pairs over ${apps} apps → ${WORK_DIR}/${RATING_PLAN_FILE}\n`
  );
  return 0;
}

function recordCommand(ctx) {
  const verdictsPath = flag(ctx.argv, "--verdicts");
  if (!verdictsPath) throw new Error("--verdicts <file> is required");
  const modelId = flag(ctx.argv, "--model-id") ?? routineModelId(ctx.root);
  if (!modelId) throw new Error(`no model_id: pass --model-id or set model: in ${ROUTINE_DOC}`);
  const rubric = loadRubric(ctx.root);
  const plan = JSON.parse(readFileSync(join(ctx.root, WORK_DIR, RATING_PLAN_FILE), "utf8"));
  const verdicts = JSON.parse(readFileSync(resolve(ctx.root, verdictsPath), "utf8"));
  const { errors, dropped, byId } = validateVerdicts(plan, verdicts, rubric);
  if (errors.length > 0) {
    ctx.stderr(`rate.mjs record: nothing appended\n  ${errors.join("\n  ")}\n`);
    return 2;
  }
  for (const d of dropped) {
    ctx.stderr(
      `rate.mjs record: dropped tell ${JSON.stringify(d.tell)} on ${d.pair_id} (not a judged rubric tell)\n`
    );
  }
  const rows = ratingRows(plan, byId, dropped, { ts: ctx.now(), modelId });
  for (const row of rows) append(RATINGS_METRIC, row, { root: ctx.root });
  ctx.stdout(
    `rate.mjs record: ${rows.map((r) => `${r.app} ${r.score}`).join(", ") || "no pairs"}\n`
  );
  return 0;
}

const COMMANDS = { pairs: pairsCommand, record: recordCommand };

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * @param {string[]} argv
 * @param {object} [deps] root, now, stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const rootFlag = argv.indexOf("--root");
  const ctx = {
    now: isoNow,
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
    argv,
    root: rootFlag !== -1 ? resolve(argv[rootFlag + 1]) : (deps.root ?? DEFAULT_ROOT),
  };
  const command = COMMANDS[argv[0]];
  if (!command) {
    ctx.stderr(`Usage: rate.mjs <${Object.keys(COMMANDS).join("|")}> [--root <dir>]\n`);
    return 2;
  }
  try {
    return command(ctx);
  } catch (err) {
    ctx.stderr(`rate.mjs ${argv[0]}: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
