import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPairs, main, positionOf, scoreOf } from "../ui-quality/rate.mjs";
import { calibrationPairs, validateCalibrationSet } from "../ui-quality/calibration.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUBRIC = JSON.parse(readFileSync(join(REPO, "docs/ui-quality/rubric.json"), "utf8"));

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG header (signature + IHDR) of the given size — enough for png.mjs, no image library. */
function png(width, height, salt = "") {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16);
  ihdr.writeUInt8(2, 17);
  return Buffer.concat([SIGNATURE, ihdr, Buffer.from(salt)]);
}

const slug = (route) => route.replace(/\W+/g, "_");

const row = (route, extra = {}) => ({
  route,
  path: route === "/" ? "/" : `/${route}`,
  fold: {
    viewport: "1280x720",
    file: `${slug(route)}@1280x720.fold.png`,
    sha256: `f-${route}`,
  },
  screenshots: [
    {
      viewport: "1280x720",
      file: `${route.replace(/\W+/g, "_")}@1280x720.png`,
      sha256: `d-${route}`,
    },
    {
      viewport: "375x812",
      file: `${route.replace(/\W+/g, "_")}@375x812.png`,
      sha256: `m-${route}`,
    },
  ],
  ...extra,
});

const MANIFESTS = {
  marketing: [
    row("/"),
    row("acmm"),
    row("metrics"),
    row("status"),
    { route: "weekly", path: "/weekly", screenshots: [], error: "net::ERR" },
  ],
  "rialto-web": [row("visual-test"), row("demos/visual-test"), row("components/button")],
};

/** A temp repo root: the committed rubric, the manifests, an empty ratings file. */
function makeRoot({ routineModel = "claude-opus-5" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ui-quality-rate-"));
  mkdirSync(join(root, "docs/ui-quality"), { recursive: true });
  writeFileSync(join(root, "docs/ui-quality/rubric.json"), JSON.stringify(RUBRIC));
  for (const ref of RUBRIC.references) {
    mkdirSync(dirname(join(root, ref.file)), { recursive: true });
    writeFileSync(join(root, ref.file), png(1280, 720, ref.id));
  }
  for (const [app, rows] of Object.entries(MANIFESTS)) {
    const dir = join(root, ".ui-quality/captures", app);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.jsonl"),
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
    );
  }
  writeFileSync(
    join(root, "docs/ui-quality/calibration.json"),
    JSON.stringify({ labelled_at: null, labelled_by: null, pairs: [] })
  );
  mkdirSync(join(root, "metrics"), { recursive: true });
  writeFileSync(join(root, "metrics/ui-quality-ratings.jsonl"), "");
  if (routineModel) {
    mkdirSync(join(root, "docs/routines"), { recursive: true });
    writeFileSync(
      join(root, "docs/routines/mbe-ui-quality.md"),
      `---\ntrigger_id: pending\nmodel: ${routineModel}\n---\n\n# mbe-ui-quality\n`
    );
  }
  return root;
}

function run(root, argv) {
  const out = [];
  const err = [];
  const code = main([...argv, "--root", root], {
    now: () => "2026-09-30T07:23:00Z",
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  });
  return { code, out: out.join(""), err: err.join("") };
}

/** `rate.mjs record` with the required --model-id. */
function record(root, verdictsFile, modelId = "claude-opus-5") {
  return run(root, ["record", "--verdicts", join(root, verdictsFile), "--model-id", modelId]);
}

const readPlan = (root) =>
  JSON.parse(readFileSync(join(root, ".ui-quality/rating-plan.json"), "utf8"));
const readRatings = (root) => readFileSync(join(root, "metrics/ui-quality-ratings.jsonl"), "utf8");

/** Verdict that makes `ours` win (1), tie (0.5) or lose (0) for a planned pair. */
const verdictFor = (pair, outcome) => {
  if (outcome === "tie") return "tie";
  const oursIsA = pair.position === "AB";
  return (outcome === "ours") === oursIsA ? "A" : "B";
};

describe("positionOf — A/B side from sha256(pair key) parity", () => {
  it("is deterministic for a key and differs across keys", () => {
    const keys = Array.from({ length: 16 }, (_, i) => `marketing|r${i}|1280x720|shadcn-home`);
    expect(keys.map(positionOf)).toEqual(keys.map(positionOf));
    expect(new Set(keys.map(positionOf))).toEqual(new Set(["AB", "BA"]));
  });
});

describe("scoreOf", () => {
  it("is 5 × mean(ours preferred 1, tie 0.5, reference preferred 0)", () => {
    expect(scoreOf(["ours", "ours", "tie", "reference", "reference", "reference"])).toBeCloseTo(
      (5 * 2.5) / 6
    );
    expect(scoreOf(["ours", "ours"])).toBe(5);
    expect(scoreOf(["reference"])).toBe(0);
  });
});

describe("buildPairs", () => {
  const pairs = buildPairs({ rubric: RUBRIC, manifests: MANIFESTS });

  it("samples 3 taste-eligible routes × 2 same-category references per app", () => {
    const marketing = pairs.filter((p) => p.app === "marketing");
    expect(marketing).toHaveLength(6);
    expect(new Set(marketing.map((p) => p.ours.route)).size).toBe(3);
    for (const p of marketing) {
      const ref = RUBRIC.references.find((r) => r.id === p.reference.id);
      expect(ref.category).toBe("marketing-site");
    }
  });

  it("never samples a harness route or a route without screenshots", () => {
    const routes = pairs.map((p) => `${p.app}|${p.ours.route}`);
    expect(routes).not.toContain("rialto-web|visual-test");
    expect(routes).not.toContain("rialto-web|demos/visual-test");
    expect(routes).not.toContain("marketing|weekly");
    expect(pairs.filter((p) => p.app === "rialto-web")).toHaveLength(2);
  });

  it("carries both image paths and the fold's sha256 — never a full-page shot", () => {
    const p = pairs.find((x) => x.app === "rialto-web");
    expect(p.ours).toMatchObject({
      route: "components/button",
      viewport: "1280x720",
      sha256: "f-components/button",
      path: ".ui-quality/captures/rialto-web/components_button@1280x720.fold.png",
    });
    for (const q of pairs) expect(q.ours.path).toMatch(/\.fold\.png$/);
    expect(p.reference.path).toMatch(/^docs\/ui-quality\/reference\/.+\.png$/);
    const [a, b] = p.position === "AB" ? [p.ours, p.reference] : [p.reference, p.ours];
    expect(p.a).toEqual({ path: a.path, sha256: a.sha256 });
    expect(p.b).toEqual({ path: b.path, sha256: b.sha256 });
  });

  it("skips a row without a fold (not taste-eligible) and leaves the plan otherwise unchanged", () => {
    const withoutFold = {
      ...MANIFESTS,
      marketing: [...MANIFESTS.marketing, { ...row("ai-health"), fold: undefined }],
    };
    delete withoutFold.marketing.at(-1).fold;
    expect(buildPairs({ rubric: RUBRIC, manifests: withoutFold })).toEqual(pairs);
    const noFoldAtAll = {
      marketing: MANIFESTS.marketing.map(({ fold: _fold, ...r }) => r),
    };
    expect(buildPairs({ rubric: RUBRIC, manifests: noFoldAtAll })).toEqual([]);
  });

  it("is identical across runs, with unique ids", () => {
    expect(buildPairs({ rubric: RUBRIC, manifests: MANIFESTS })).toEqual(pairs);
    expect(new Set(pairs.map((p) => p.id)).size).toBe(pairs.length);
  });
});

describe("rate.mjs pairs + record", () => {
  let root;
  beforeEach(() => {
    root = makeRoot();
  });

  const fullVerdicts = (plan, outcomes) =>
    plan.pairs.map((p, i) => ({
      pair_id: p.id,
      verdict: verdictFor(p, outcomes(p, i)),
      tells: [],
      note: "n",
    }));

  it("pairs writes .ui-quality/rating-plan.json, reproducibly", () => {
    expect(run(root, ["pairs"]).code).toBe(0);
    const first = readFileSync(join(root, ".ui-quality/rating-plan.json"), "utf8");
    expect(run(root, ["pairs"]).code).toBe(0);
    expect(readFileSync(join(root, ".ui-quality/rating-plan.json"), "utf8")).toBe(first);
    expect(readPlan(root).pairs).toHaveLength(8);
  });

  it("pairs refuses (exit 2, no plan) when a rubric reference is not 1280×720 by its header", () => {
    writeFileSync(join(root, RUBRIC.references[0].file), png(1280, 4529));
    const res = run(root, ["pairs"]);
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/1280x4529/);
    expect(existsSync(join(root, ".ui-quality/rating-plan.json"))).toBe(false);
  });

  it("record appends one row per app with the score, the --model-id, every pair", () => {
    run(root, ["pairs"]);
    const plan = readPlan(root);
    const marketing = plan.pairs.filter((p) => p.app === "marketing").map((p) => p.id);
    const outcome = (p) => {
      if (p.app !== "marketing") return "ours";
      const i = marketing.indexOf(p.id);
      return i < 2 ? "ours" : i === 2 ? "tie" : "reference";
    };
    writeFileSync(join(root, "v.json"), JSON.stringify(fullVerdicts(plan, outcome)));

    expect(record(root, "v.json").code).toBe(0);
    const rows = readRatings(root)
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows.map((r) => r.app)).toEqual(["marketing", "rialto-web"]);
    const [m, r] = rows;
    expect(m.score).toBeCloseTo((5 * 2.5) / 6, 2);
    expect(r.score).toBe(5);
    expect(m).toMatchObject({
      ts: "2026-09-30T07:23:00Z",
      rubric_version: 1,
      model_id: "claude-opus-5",
      dropped_tells: 0,
    });
    expect(m.pairs).toHaveLength(6);
    expect(m.pairs[0]).toMatchObject({
      id: expect.any(String),
      position: expect.stringMatching(/^(AB|BA)$/),
      verdict: expect.stringMatching(/^(A|B|tie)$/),
      tells: [],
      note: "n",
      ours: { route: expect.any(String), viewport: "1280x720", sha256: expect.any(String) },
      reference: { id: expect.any(String), sha256: expect.any(String) },
    });
    expect(m.pairs[0].ours.path).toMatch(/^\.ui-quality\/captures\/marketing\/.+\.fold\.png$/);
    expect(m.pairs[0].reference.path).toMatch(/^docs\/ui-quality\/reference\//);
  });

  it("record without --model-id exits 2 and appends nothing — the routine doc is never a fallback", () => {
    run(root, ["pairs"]);
    writeFileSync(join(root, "v.json"), JSON.stringify(fullVerdicts(readPlan(root), () => "tie")));
    const res = run(root, ["record", "--verdicts", join(root, "v.json")]);
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/--model-id/);
    expect(readRatings(root)).toBe("");
  });

  it("a --model-id matching the routine doc's model: prints nothing; a mismatch prints exactly one stderr line and still appends", () => {
    run(root, ["pairs"]);
    writeFileSync(join(root, "v.json"), JSON.stringify(fullVerdicts(readPlan(root), () => "tie")));
    const same = record(root, "v.json", "claude-opus-5");
    expect(same.code).toBe(0);
    expect(same.err).not.toMatch(/model/);

    const other = makeRoot({ routineModel: "other" });
    run(other, ["pairs"]);
    writeFileSync(
      join(other, "v.json"),
      JSON.stringify(fullVerdicts(readPlan(other), () => "tie"))
    );
    const res = record(other, "v.json", "claude-opus-5");
    expect(res.code).toBe(0);
    expect(res.err.split("\n").filter((l) => /model/.test(l))).toHaveLength(1);
    expect(JSON.parse(readRatings(other).split("\n")[0]).model_id).toBe("claude-opus-5");
  });

  it("exits 2 and appends nothing on a missing verdict", () => {
    run(root, ["pairs"]);
    const verdicts = fullVerdicts(readPlan(root), () => "ours").slice(1);
    writeFileSync(join(root, "v.json"), JSON.stringify(verdicts));
    const res = record(root, "v.json");
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/missing/);
    expect(readRatings(root)).toBe("");
  });

  it("exits 2 and appends nothing on a pair id not in the plan", () => {
    run(root, ["pairs"]);
    const verdicts = fullVerdicts(readPlan(root), () => "ours");
    verdicts.push({ pair_id: "p-nope", verdict: "A", tells: [], note: "" });
    writeFileSync(join(root, "v.json"), JSON.stringify(verdicts));
    const res = record(root, "v.json");
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/p-nope/);
    expect(readRatings(root)).toBe("");
  });

  it("drops a tell outside the rubric and a mechanical-detection tell, one log line each; the verdict still counts", () => {
    run(root, ["pairs"]);
    const plan = readPlan(root);
    const verdicts = fullVerdicts(plan, () => "reference");
    const first = plan.pairs.findIndex((p) => p.app === "marketing");
    verdicts[first].tells = [
      "agent-built/made-up",
      "bugs/blank-render",
      "agent-built/generic-hero-copy",
    ];
    writeFileSync(join(root, "v.json"), JSON.stringify(verdicts));

    const res = record(root, "v.json");
    expect(res.code).toBe(0);
    expect(res.err.match(/dropped tell/g)).toHaveLength(2);
    const [m, r] = readRatings(root)
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(m.dropped_tells).toBe(2);
    expect(m.score).toBe(0);
    expect(m.pairs.find((p) => p.id === plan.pairs[first].id).tells).toEqual([
      "agent-built/generic-hero-copy",
    ]);
    expect(r.dropped_tells).toBe(0);
  });

  it("never writes an absolute single-answer score field", () => {
    run(root, ["pairs"]);
    writeFileSync(join(root, "v.json"), JSON.stringify(fullVerdicts(readPlan(root), () => "tie")));
    record(root, "v.json");
    const [m] = readRatings(root)
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    for (const p of m.pairs) expect(p).not.toHaveProperty("score");
    expect(existsSync(join(root, ".ui-quality/rating-plan.json"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calibrate + calibration.json
// ---------------------------------------------------------------------------

const REFS = RUBRIC.references.map((r) => r.id);

const hashOf = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Ten labelled pairs over committed-style 1280×720 fold PNGs in the temp root:
 * `ours` index `oursOf(i)`, reference `REFS[refOf(i)]`, each with its ours_sha256.
 */
function labelled(
  root,
  prefers = () => "reference",
  { oursOf = (i) => i % 5, refOf = (i) => i % REFS.length, size = [1280, 720] } = {}
) {
  const dir = join(root, "docs/ui-quality/calibration");
  mkdirSync(dir, { recursive: true });
  const pairs = Array.from({ length: 10 }, (_, i) => {
    const ours = `docs/ui-quality/calibration/ours-${oursOf(i)}.png`;
    const bytes = png(size[0], size[1], `ours-${oursOf(i)}`);
    writeFileSync(join(root, ours), bytes);
    return {
      ours,
      ours_sha256: hashOf(bytes),
      reference: REFS[refOf(i)],
      human_prefers: prefers(i),
    };
  });
  const set = { labelled_at: "2026-10-01", labelled_by: "Matt", pairs };
  writeFileSync(join(root, "docs/ui-quality/calibration.json"), JSON.stringify(set));
  return set;
}

/**
 * Rater verdicts that agree with the human on the first `agree` pairs; of the
 * rest, the first `inversions` prefer ours where the human preferred the
 * reference, and the remainder are ties.
 */
function raterVerdicts(set, { agree, inversions }) {
  return calibrationPairs(set).map((p, i) => {
    const human = set.pairs[i].human_prefers;
    let outcome = human;
    if (i >= agree) outcome = i < agree + inversions ? "ours" : "tie";
    return { pair_id: p.id, verdict: verdictFor(p, outcome), tells: [], note: "" };
  });
}

function calibrate(root, verdicts, extra = ["--model-id", "claude-opus-5"]) {
  writeFileSync(join(root, "cv.json"), JSON.stringify(verdicts));
  return run(root, ["calibrate", "--verdicts", join(root, "cv.json"), ...extra]);
}

const setSha = (root) => hashOf(readFileSync(join(root, "docs/ui-quality/calibration.json")));

const calibrations = (root) => {
  const file = join(root, "metrics/ui-quality-calibrations.jsonl");
  return existsSync(file)
    ? readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
};

describe("rate.mjs calibrate", () => {
  let root;
  let set;
  beforeEach(() => {
    root = makeRoot();
    set = labelled(root);
  });

  it("9/10 agreement with 1 inversion fails (exit 1): an inversion is never tolerated", () => {
    const res = calibrate(root, raterVerdicts(set, { agree: 9, inversions: 1 }));
    expect(res.code).toBe(1);
    const report = JSON.parse(res.out);
    expect(report).toMatchObject({ agreement: 0.9, inversions: 1 });
    expect(report.disagreements).toHaveLength(1);
    expect(report.disagreements[0]).toMatchObject({
      human_prefers: "reference",
      rater_prefers: "ours",
    });
  });

  it("8/10 agreement with 0 inversions passes (exit 0)", () => {
    const res = calibrate(root, raterVerdicts(set, { agree: 8, inversions: 0 }));
    expect(res.code).toBe(0);
    expect(JSON.parse(res.out)).toMatchObject({ agreement: 0.8, inversions: 0 });
    expect(calibrations(root)).toEqual([
      expect.objectContaining({ model_id: "claude-opus-5", pass: true, agreement: 0.8 }),
    ]);
  });

  it("7/10 agreement with 0 inversions fails (exit 1)", () => {
    const res = calibrate(root, raterVerdicts(set, { agree: 7, inversions: 0 }));
    expect(res.code).toBe(1);
    expect(calibrations(root)).toEqual([expect.objectContaining({ pass: false })]);
  });

  it("the appended record carries set_sha256 = sha256 of calibration.json's bytes, model_id and rubric_version", () => {
    calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }));
    expect(calibrations(root)).toEqual([
      expect.objectContaining({
        model_id: "claude-opus-5",
        rubric_version: 1,
        set_sha256: setSha(root),
        pass: true,
      }),
    ]);
  });

  it("prints Matt's human_prefers split (never gated)", () => {
    const skewed = labelled(root, (i) => (i < 7 ? "ours" : "reference"));
    const res = calibrate(root, raterVerdicts(skewed, { agree: 10, inversions: 0 }));
    expect(res.code).toBe(0);
    expect(JSON.parse(res.out).human_prefers).toEqual({ ours: 7, reference: 3 });
  });

  it("composition: 10 pairs over 4 distinct ours → exit 2, nothing recorded", () => {
    const bad = labelled(root, undefined, { oursOf: (i) => i % 4, refOf: (i) => i % 5 });
    const res = calibrate(root, raterVerdicts(bad, { agree: 10, inversions: 0 }));
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/distinct ours/);
    expect(calibrations(root)).toEqual([]);
  });

  it("composition: 10 pairs over 4 distinct references → exit 2", () => {
    const bad = labelled(root, undefined, { oursOf: (i) => i % 5, refOf: (i) => i % 4 });
    const res = calibrate(root, raterVerdicts(bad, { agree: 10, inversions: 0 }));
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/distinct reference/);
  });

  it("an ours of 1280×4529 → exit 2 (both pairs --calibration and calibrate)", () => {
    const bad = labelled(root, undefined, { size: [1280, 4529] });
    expect(calibrate(root, raterVerdicts(bad, { agree: 10, inversions: 0 })).code).toBe(2);
    const res = run(root, ["pairs", "--calibration"]);
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/1280x4529/);
    expect(existsSync(join(root, ".ui-quality/calibration-plan.json"))).toBe(false);
  });

  it("an ours whose bytes do not hash to its ours_sha256 → exit 2", () => {
    writeFileSync(join(root, set.pairs[0].ours), png(1280, 720, "relabelled pixels"));
    const res = calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }));
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/ours_sha256/);
  });

  it("calibrate without --model-id, or with unknown, exits 2 and leaves the calibrations file unchanged", () => {
    const verdicts = raterVerdicts(set, { agree: 10, inversions: 0 });
    const none = calibrate(root, verdicts, []);
    expect(none.code).toBe(2);
    expect(none.err).toMatch(/--model-id/);
    const unknown = calibrate(root, verdicts, ["--model-id", "unknown"]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toMatch(/unknown/);
    expect(existsSync(join(root, "metrics/ui-quality-calibrations.jsonl"))).toBe(false);
  });

  it("calibrate without --verdicts exits 2", () => {
    expect(run(root, ["calibrate", "--model-id", "claude-opus-5"]).code).toBe(2);
  });

  it("an empty labelled set exits 2 and records nothing — never passes on no data", () => {
    writeFileSync(
      join(root, "docs/ui-quality/calibration.json"),
      JSON.stringify({ labelled_at: null, labelled_by: null, pairs: [] })
    );
    const res = calibrate(root, []);
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/Verify/);
    expect(calibrations(root)).toEqual([]);
  });

  it("a malformed set (unknown reference, bad human_prefers, missing image) exits 2", () => {
    for (const mutate of [
      (s) => (s.pairs[0].reference = "not-a-ref"),
      (s) => (s.pairs[0].human_prefers = "tie"),
      (s) => (s.pairs[0].ours = "docs/ui-quality/calibration/missing.png"),
    ]) {
      const bad = JSON.parse(JSON.stringify(set));
      mutate(bad);
      writeFileSync(join(root, "docs/ui-quality/calibration.json"), JSON.stringify(bad));
      expect(calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 })).code).toBe(2);
    }
  });

  it("a missing verdict exits 2", () => {
    expect(calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }).slice(1)).code).toBe(2);
  });

  it("pairs --calibration writes the calibration plan the model judges", () => {
    expect(run(root, ["pairs", "--calibration"]).code).toBe(0);
    const plan = JSON.parse(readFileSync(join(root, ".ui-quality/calibration-plan.json"), "utf8"));
    expect(plan.pairs.map((p) => p.id)).toEqual(calibrationPairs(set).map((p) => p.id));
    expect(plan.pairs[0].a.path).toMatch(/\.png$/);
  });
});

describe("record stamps calibration status from the latest record with the fire's (model_id, rubric_version, set_sha256)", () => {
  let root;
  beforeEach(() => {
    root = makeRoot();
    run(root, ["pairs"]);
    writeFileSync(
      join(root, "v.json"),
      JSON.stringify(
        readPlan(root).pairs.map((p) => ({ pair_id: p.id, verdict: "tie", tells: [], note: "" }))
      )
    );
  });
  const stamped = () => JSON.parse(readRatings(root).split("\n")[0]).calibration;

  it("rubric bump → stale: a pass record at v1, then record under a v2 rubric", () => {
    const set = labelled(root);
    calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }));
    writeFileSync(
      join(root, "docs/ui-quality/rubric.json"),
      JSON.stringify({ ...RUBRIC, rubric_version: 2 })
    );
    record(root, "v.json");
    expect(stamped()).toMatchObject({ status: "stale" });
  });

  it("set edit → stale: one byte of calibration.json changed after a pass record", () => {
    const set = labelled(root);
    calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }));
    const file = join(root, "docs/ui-quality/calibration.json");
    writeFileSync(file, readFileSync(file, "utf8") + " ");
    record(root, "v.json");
    expect(stamped()).toMatchObject({ status: "stale" });
  });

  it("failed stays failed: a later record with the same key stamps failed, never pass or stale", () => {
    const set = labelled(root);
    calibrate(root, raterVerdicts(set, { agree: 9, inversions: 1 }));
    record(root, "v.json");
    record(root, "v.json");
    const rows = readRatings(root)
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).calibration.status);
    expect(new Set(rows)).toEqual(new Set(["failed"]));
  });

  it("a model switch A → B → A re-uses A's record", () => {
    const set = labelled(root);
    calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }), ["--model-id", "model-a"]);
    calibrate(root, raterVerdicts(set, { agree: 7, inversions: 0 }), ["--model-id", "model-b"]);
    record(root, "v.json", "model-b");
    record(root, "v.json", "model-a");
    const [b, a] = readRatings(root)
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .filter((r) => r.app === "marketing")
      .map((r) => r.calibration.status);
    expect([b, a]).toEqual(["failed", "pass"]);
  });

  it("stale when no calibration record exists for this model_id", () => {
    writeFileSync(
      join(root, "metrics/ui-quality-calibrations.jsonl"),
      JSON.stringify({
        ts: "t",
        model_id: "older-model",
        pass: true,
        agreement: 1,
        inversions: 0,
      }) + "\n"
    );
    record(root, "v.json");
    expect(stamped()).toMatchObject({ status: "stale", pass_mark: RUBRIC.calibration.pass_mark });
  });

  it("--model-id unknown always stamps stale, even with a passing record under unknown", () => {
    writeFileSync(
      join(root, "metrics/ui-quality-calibrations.jsonl"),
      JSON.stringify({
        ts: "t",
        model_id: "unknown",
        rubric_version: 1,
        set_sha256: setSha(root),
        pass: true,
        agreement: 1,
        inversions: 0,
      }) + "\n"
    );
    record(root, "v.json", "unknown");
    expect(stamped()).toMatchObject({ status: "stale" });
  });

  it("pass after a passing calibrate, failed after a failing one", () => {
    const set = labelled(root);
    calibrate(root, raterVerdicts(set, { agree: 10, inversions: 0 }));
    record(root, "v.json");
    expect(stamped()).toMatchObject({ status: "pass", agreement: 1, inversions: 0 });

    calibrate(root, raterVerdicts(set, { agree: 9, inversions: 1 }));
    writeFileSync(join(root, "metrics/ui-quality-ratings.jsonl"), "");
    record(root, "v.json");
    expect(stamped()).toMatchObject({ status: "failed", agreement: 0.9, inversions: 1 });
  });
});

describe("committed calibration.json placeholder", () => {
  const placeholder = JSON.parse(
    readFileSync(join(REPO, "docs/ui-quality/calibration.json"), "utf8")
  );

  it("ships labelled_at: null and pairs: [] and validates against the schema", () => {
    expect(placeholder).toEqual({ labelled_at: null, labelled_by: null, pairs: [] });
    expect(
      validateCalibrationSet(placeholder, { root: REPO, rubric: RUBRIC, allowEmpty: true })
    ).toEqual([]);
  });

  it("calibrate on it exits 2 naming the Verify step", () => {
    const root = makeRoot();
    writeFileSync(join(root, "docs/ui-quality/calibration.json"), JSON.stringify(placeholder));
    const res = calibrate(root, []);
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/Verify/);
  });
});
