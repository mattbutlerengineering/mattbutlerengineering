/**
 * calibration.mjs — the gate on the taste rater
 * (docs/features/ui-quality-loop/architecture.md § Components "Taste rater",
 * § Data model `docs/ui-quality/calibration.json`; autorun-brief decision 10).
 *
 * `docs/ui-quality/calibration.json` holds Matt's one-time labels:
 * `{ labelled_at, labelled_by, pairs: [{ ours, reference, human_prefers }] }`,
 * where `ours` is a repo-relative PNG (committed, so a later model change can
 * re-run calibration against the same pixels), `reference` a rubric reference
 * id and `human_prefers` `ours | reference`. The rater judges the same pairs;
 * it passes when agreement ≥ `pass_mark.agreement` and inversions ≤
 * `pass_mark.inversions` (0). An inversion is the rubber-stamp failure: the
 * rater prefers ours where Matt preferred the reference. A tie is a
 * disagreement, never an inversion. An empty or malformed set never passes.
 *
 * Pure: file reads happen in `rate.mjs`, except `validateCalibrationSet`'s
 * existence check on each `ours` image.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { CALIBRATION_MIN_PAIRS } from "./config.mjs";
import { outcomeOf, sha256, sides } from "./pairing.mjs";

export const CALIBRATION_FILE = "docs/ui-quality/calibration.json";
const PREFERENCES = ["ours", "reference"];

export const VERIFY_HINT =
  `${CALIBRATION_FILE} has no labelled pairs yet — Matt labels ≥ ${CALIBRATION_MIN_PAIRS} ` +
  "pairs once at the Verify stage (docs/features/ui-quality-loop/breakdown.md § Notes, " +
  '"Verify-owned"); until then the rater is uncalibrated and its agent-built findings stay suppressed';

const isString = (v) => typeof v === "string" && v !== "";

function pairErrors(pair, i, { root, refIds }) {
  const where = `calibration pair ${i}`;
  const errors = [];
  if (!isString(pair?.ours) || !pair.ours.endsWith(".png")) {
    errors.push(`${where}: ours must be a repo-relative .png path`);
  } else if (!existsSync(join(root, pair.ours))) {
    errors.push(`${where}: ours ${pair.ours} does not exist (commit it beside calibration.json)`);
  }
  if (!refIds.has(pair?.reference)) errors.push(`${where}: unknown reference ${pair?.reference}`);
  if (!PREFERENCES.includes(pair?.human_prefers)) {
    errors.push(`${where}: human_prefers must be ${PREFERENCES.join("|")}`);
  }
  return errors;
}

/**
 * @param {object} doc parsed calibration.json
 * @param {{ root: string, rubric: object, allowEmpty?: boolean }} opts
 *   `allowEmpty` accepts the unlabelled placeholder (schema check only)
 * @returns {string[]} every problem; empty means usable
 */
export function validateCalibrationSet(doc, { root, rubric, allowEmpty = false }) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.pairs)) {
    return [`${CALIBRATION_FILE}: pairs must be an array`];
  }
  if (doc.pairs.length === 0) {
    const nullHeader = doc.labelled_at === null && doc.labelled_by === null;
    if (!nullHeader) return [`${CALIBRATION_FILE}: an unlabelled set has labelled_at/by null`];
    return allowEmpty ? [] : [VERIFY_HINT];
  }
  const errors = [];
  if (!isString(doc.labelled_at) || !isString(doc.labelled_by)) {
    errors.push(`${CALIBRATION_FILE}: a labelled set needs labelled_at and labelled_by`);
  }
  if (doc.pairs.length < CALIBRATION_MIN_PAIRS) {
    errors.push(`${CALIBRATION_FILE}: ${doc.pairs.length} pairs < ${CALIBRATION_MIN_PAIRS}`);
  }
  const refIds = new Set(rubric.references.map((r) => r.id));
  errors.push(...doc.pairs.flatMap((pair, i) => pairErrors(pair, i, { root, refIds })));
  const keys = doc.pairs.map((p) => `${p.ours}|${p.reference}`);
  if (new Set(keys).size !== keys.length) errors.push(`${CALIBRATION_FILE}: duplicate pair`);
  return errors;
}

/** The labelled pairs as rater pairs: opaque `c-` ids, A/B from the key's hash parity. */
export function calibrationPairs(doc, rubric) {
  const refPath = new Map((rubric?.references ?? []).map((r) => [r.id, r.file]));
  return doc.pairs.map((pair) => {
    const key = `calibration|${pair.ours}|${pair.reference}`;
    const ours = { path: pair.ours };
    const reference = { id: pair.reference, path: refPath.get(pair.reference) ?? null };
    const { position, a, b } = sides(key, ours, reference);
    return {
      id: `c-${sha256(key).slice(0, 12)}`,
      key,
      position,
      a: { path: a.path },
      b: { path: b.path },
      ours,
      reference,
    };
  });
}

/**
 * @param {object} doc labelled calibration set
 * @param {Map<string, { verdict: string }>} byId rater verdicts by pair id (complete)
 * @param {{ agreement: number, inversions: number }} passMark
 */
export function scoreCalibration(doc, byId, passMark) {
  const pairs = calibrationPairs(doc);
  const disagreements = [];
  let agreed = 0;
  pairs.forEach((pair, i) => {
    const human = doc.pairs[i].human_prefers;
    const rater = outcomeOf(pair, byId.get(pair.id).verdict);
    if (rater === human) agreed += 1;
    else {
      disagreements.push({
        pair_id: pair.id,
        ours: pair.ours.path,
        reference: pair.reference.id,
        human_prefers: human,
        rater_prefers: rater,
      });
    }
  });
  const agreement = Math.round((agreed / pairs.length) * 1000) / 1000;
  const inversions = disagreements.filter(
    (d) => d.human_prefers === "reference" && d.rater_prefers === "ours"
  ).length;
  const pass = agreement >= passMark.agreement && inversions <= passMark.inversions;
  return { agreement, inversions, disagreements, pass };
}

/**
 * The `calibration` stamp for a ratings row: the latest calibration record for
 * this `model_id` decides `pass | failed`; no record for it at all is `stale`
 * (the model changed since the last calibration, or none ever ran).
 */
export function calibrationStamp(records, modelId, passMark) {
  const mine = records.filter((r) => r.model_id === modelId);
  const last = mine.reduce(
    (latest, r) => (latest === null || r.ts >= latest.ts ? r : latest),
    null
  );
  if (!last) return { status: "stale", agreement: null, inversions: null, pass_mark: passMark };
  return {
    status: last.pass ? "pass" : "failed",
    agreement: last.agreement,
    inversions: last.inversions,
    pass_mark: passMark,
  };
}
