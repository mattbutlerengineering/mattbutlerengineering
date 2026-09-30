#!/usr/bin/env node
/**
 * rate.mjs — the taste rater's record, not its judgement
 * (docs/features/ui-quality-loop/architecture.md § Components "Taste rater",
 * § Interfaces `rate.mjs pairs | record | calibrate`).
 *
 *   pairs   read the capture manifests + rubric, write `.ui-quality/rating-plan.json`:
 *           per app, TASTE_SAMPLE_ROUTES taste-eligible captured routes ×
 *           TASTE_REFERENCES_PER_ROUTE references of the same category. The unit on
 *           both sides is the 1280×720 fold: ours is the manifest row's `fold` (a row
 *           without one is not taste-eligible), and every rubric reference must be
 *           exactly 1280×720 by its PNG header or `pairs` exits 2 writing no plan.
 *           `harness` routes are never sampled. Which image is "A" is decided by the
 *           parity of sha256(pair key), so a re-run reproduces the plan byte for byte.
 *           `pairs --calibration` writes `.ui-quality/calibration-plan.json` from
 *           `docs/ui-quality/calibration.json`'s labelled pairs instead.
 *   record  validate the model's verdicts (`[{ pair_id, verdict: "A"|"B"|"tie",
 *           tells, note }]`) against the plan and append one row per app to
 *           `metrics/ui-quality-ratings.jsonl`, stamped `calibration.status`
 *           pass | failed | stale from the latest calibration record for its model_id.
 *           `--model-id` is required — the judging session's own exact model id; a
 *           mismatch with the routine doc's `model:` is one stderr line, never an
 *           exit, and the literal `unknown` always stamps `stale`.
 *   calibrate  score verdicts on the calibration plan against `pass_mark`, print
 *           `{ agreement, inversions, disagreements[] }`, append a record to
 *           `metrics/ui-quality-calibrations.jsonl`; exit 0 pass, 1 fail, 2 on an
 *           empty or malformed set (never passes on no data).
 *
 * The model seam degrades past a bad part, never past a bad unit: a tell id the
 * rubric lacks, or whose `detection` is not `judged`, is dropped, logged and
 * counted (`dropped_tells`) and the verdict stands; a missing verdict, a pair id
 * not in the plan, or a malformed verdict exits 2 and appends nothing — a partial
 * score is a wrong score. Only pairwise preferences are recorded; an absolute
 * single-answer score is never produced.
 *
 * Exit codes: 0 ok, 1 calibration failed, 2 bad input.
 *
 * Usage: node scripts/ui-quality/rate.mjs <pairs [--calibration]|record|calibrate>
 *          [--verdicts <file>] [--model-id <id>] [--root <dir>]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { append, resolvePath } from "../metrics-store.mjs";
import {
  CALIBRATION_FILE,
  calibrationPairs,
  calibrationStamp,
  scoreCalibration,
  validateCalibrationSet,
} from "./calibration.mjs";
import { TASTE_REFERENCES_PER_ROUTE, TASTE_SAMPLE_ROUTES } from "./config.mjs";
import { outcomeOf, positionOf, sha256, sides, VERDICTS } from "./pairing.mjs";
import { pngSizeOfFile } from "./png.mjs";
import { categoryOf, loadRubric, tellsById } from "./rubric.mjs";

export { positionOf };

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RATINGS_METRIC = "ui-quality-ratings";
export const WORK_DIR = ".ui-quality";
export const RATING_PLAN_FILE = "rating-plan.json";
export const CALIBRATION_PLAN_FILE = "calibration-plan.json";
export const CALIBRATIONS_METRIC = "ui-quality-calibrations";
export const ROUTINE_DOC = "docs/routines/mbe-ui-quality.md";
const CAPTURES_DIR = "captures";
/** The fold size pairs are judged at — the one the references were captured at. */
export const PAIR_VIEWPORT = "1280x720";
/** A model id that is not one: never calibrated, so always `stale`. */
export const UNKNOWN_MODEL_ID = "unknown";
const OUTCOME_VALUE = { ours: 1, tie: 0.5, reference: 0 };

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

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
    viewport: shot.viewport,
    sha256: shot.sha256,
    path: `${WORK_DIR}/${CAPTURES_DIR}/${app}/${shot.file}`,
  };
  const reference = { id: ref.id, sha256: ref.sha256, path: ref.file };
  const { position, a, b } = sides(key, ours, reference);
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
        const shot = row.fold;
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
export function ratingRows(plan, byId, dropped, { ts, modelId, calibration }) {
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
      calibration,
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

/** Every row of a jsonl metric, or [] when the file is absent. */
function readJsonl(name, root) {
  const file = resolvePath(name, { root });
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

/** calibration.json, validated; throws VERIFY_HINT or every schema error. */
function loadCalibrationSet(root, rubric) {
  const doc = JSON.parse(readFileSync(join(root, CALIBRATION_FILE), "utf8"));
  const errors = validateCalibrationSet(doc, { root, rubric });
  if (errors.length > 0) throw new Error(errors.join("\n  "));
  return doc;
}

function calibrationPlanCommand(ctx, rubric, work) {
  const pairs = calibrationPairs(loadCalibrationSet(ctx.root, rubric), rubric);
  mkdirSync(work, { recursive: true });
  const plan = { rubric_version: rubric.rubric_version, pairs };
  writeFileSync(join(work, CALIBRATION_PLAN_FILE), JSON.stringify(plan, null, 2) + "\n");
  ctx.stdout(
    `rate.mjs pairs --calibration: ${pairs.length} pairs → ${WORK_DIR}/${CALIBRATION_PLAN_FILE}\n`
  );
  return 0;
}

/** Every rubric reference, sized by its PNG header; throws naming each one that is not the fold size. */
function assertReferenceSizes(root, rubric) {
  const wrong = rubric.references.flatMap((ref) => {
    const { width, height } = pngSizeOfFile(join(root, ref.file));
    const size = `${width}x${height}`;
    return size === PAIR_VIEWPORT ? [] : [`${ref.id} (${ref.file}) is ${size}`];
  });
  if (wrong.length > 0) {
    throw new Error(
      `every reference must be ${PAIR_VIEWPORT} by its PNG header — no plan written:\n  ${wrong.join("\n  ")}`
    );
  }
}

function pairsCommand(ctx) {
  const rubric = loadRubric(ctx.root);
  assertReferenceSizes(ctx.root, rubric);
  const work = join(ctx.root, WORK_DIR);
  if (ctx.argv.includes("--calibration")) return calibrationPlanCommand(ctx, rubric, work);
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
  const modelId = requireModelId(ctx);
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
  const calibration = calibrationStamp(
    modelId === UNKNOWN_MODEL_ID ? [] : readJsonl(CALIBRATIONS_METRIC, ctx.root),
    modelId,
    rubric.calibration.pass_mark
  );
  const rows = ratingRows(plan, byId, dropped, { ts: ctx.now(), modelId, calibration });
  for (const row of rows) append(RATINGS_METRIC, row, { root: ctx.root });
  ctx.stdout(
    `rate.mjs record: ${rows.map((r) => `${r.app} ${r.score}`).join(", ") || "no pairs"}\n`
  );
  return 0;
}

/**
 * The required `--model-id`: the judging session's own exact model id. The
 * routine doc's `model:` is the declared config and can drift from the
 * trigger, so it is only compared — one stderr line on a mismatch.
 */
function requireModelId(ctx) {
  const modelId = flag(ctx.argv, "--model-id");
  if (!modelId) throw new Error("--model-id <the judging session's exact model id> is required");
  const declared = routineModelId(ctx.root);
  if (declared !== null && declared !== modelId) {
    ctx.stderr(
      `rate.mjs ${ctx.argv[0]}: --model-id ${modelId} differs from ${ROUTINE_DOC} model: ${declared}\n`
    );
  }
  return modelId;
}

function modelIdOf(ctx) {
  const modelId = flag(ctx.argv, "--model-id") ?? routineModelId(ctx.root);
  if (!modelId) throw new Error(`no model_id: pass --model-id or set model: in ${ROUTINE_DOC}`);
  return modelId;
}

/**
 * Score the rater's verdicts on the labelled set against the pass mark, print
 * `{ agreement, inversions, disagreements[] }`, append a calibration record.
 * Exit 0 on pass, 1 on fail, 2 on an empty/malformed set or verdict file.
 */
function calibrateCommand(ctx) {
  const verdictsPath = flag(ctx.argv, "--verdicts");
  const rubric = loadRubric(ctx.root);
  const doc = loadCalibrationSet(ctx.root, rubric);
  if (!verdictsPath) throw new Error("--verdicts <file> is required");
  const modelId = modelIdOf(ctx);
  const verdicts = JSON.parse(readFileSync(resolve(ctx.root, verdictsPath), "utf8"));
  const { errors, byId } = validateVerdicts({ pairs: calibrationPairs(doc) }, verdicts, rubric);
  if (errors.length > 0) {
    ctx.stderr(`rate.mjs calibrate: nothing recorded\n  ${errors.join("\n  ")}\n`);
    return 2;
  }
  const passMark = rubric.calibration.pass_mark;
  const { agreement, inversions, disagreements, pass } = scoreCalibration(doc, byId, passMark);
  append(
    CALIBRATIONS_METRIC,
    {
      ts: ctx.now(),
      model_id: modelId,
      rubric_version: rubric.rubric_version,
      labelled_at: doc.labelled_at,
      pairs: doc.pairs.length,
      agreement,
      inversions,
      pass,
      pass_mark: passMark,
    },
    { root: ctx.root }
  );
  ctx.stdout(JSON.stringify({ agreement, inversions, disagreements }, null, 2) + "\n");
  ctx.stderr(`rate.mjs calibrate: ${pass ? "PASS" : "FAIL"} for ${modelId}\n`);
  return pass ? 0 : 1;
}

const COMMANDS = { pairs: pairsCommand, record: recordCommand, calibrate: calibrateCommand };

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
