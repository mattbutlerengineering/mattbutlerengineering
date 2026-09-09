import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  measure,
  renderMeasurementTable,
  resolvePlaywrightCoreDir,
  shiftPngChannels,
  DEFAULT_THRESHOLDS,
  DEFAULT_DEFECT_AMPLITUDE,
  PAIRINGS,
} from "../visual-noise-floor.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const MODULE_SOURCE = readFileSync(resolve(ROOT, "scripts/visual-noise-floor.mjs"), "utf8");

// The synthetic PNGs come from the SAME installed playwright-core the analyzer
// compares with — `pngjs` is not a dependency of this repo and adding one to
// build fixtures would touch pnpm-lock.yaml, a turbo globalDependencies entry.
const require_ = createRequire(join(ROOT, "anchor.mjs"));
const { PNG } = require_(join(resolvePlaywrightCoreDir(), "lib/utilsBundle.js"));

const W = 8;
const H = 4;
const AREA = W * H;

function flatPng(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

const BASE = [200, 200, 200];
const NEAR = [196, 196, 196]; // per-channel delta 4 — over threshold 0.01, under 0.02
const FAR = [40, 40, 40]; // over every sweep point

const PROVENANCE = {
  imageOs: "ubuntu24",
  imageVersion: "20260810.271",
  playwrightVersion: "1.62.1",
  chromiumBuild: "chromium-1200",
};

let root;

/**
 * A four-directory measurement input. `spec` maps leg -> snapshot -> PNG buffer;
 * `provenance` maps leg -> object (omit to write the agreed tuple).
 */
function makeInput(spec, provenanceBySpec = {}) {
  const dir = mkdtempSync(join(root, "case-"));
  const dirs = {};
  for (const leg of ["replicaA", "replicaB", "perturbed", "committed"]) {
    const legDir = join(dir, leg);
    mkdirSync(legDir, { recursive: true });
    dirs[leg] = legDir;
    for (const [name, buffer] of Object.entries(spec[leg] ?? {})) {
      writeFileSync(join(legDir, name), buffer);
    }
    if (leg !== "committed") {
      // `??` would be wrong here: `null` is the deliberate "write none" marker.
      const prov = leg in provenanceBySpec ? provenanceBySpec[leg] : PROVENANCE;
      if (prov !== null) {
        writeFileSync(join(legDir, "provenance.json"), JSON.stringify(prov));
      }
    }
  }
  return dirs;
}

/** The healthy two-snapshot case every positive assertion below is built on. */
function healthy() {
  const names = ["light-alpha.png", "dark-beta.png"];
  const leg = (color) => Object.fromEntries(names.map((n) => [n, flatPng(W, H, color)]));
  return makeInput({
    replicaA: leg(BASE),
    replicaB: leg(BASE), // identical -> `run` noise is 0
    committed: leg(NEAR), // small drift -> counted below threshold 0.02 only
    perturbed: leg(FAR), // strong signal -> counted at every sweep point
  });
}

function rowFor(measurements, snapshot, pairing, threshold) {
  return measurements.find(
    (m) => m.snapshot === snapshot && m.pairing === pairing && m.threshold === threshold
  );
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "visual-noise-floor-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("measure — the row set", () => {
  it("emits names x pairings x thresholds rows, in the § Data model shape", () => {
    const { measurements } = measure(healthy());

    expect(DEFAULT_THRESHOLDS).toHaveLength(8);
    expect(PAIRINGS).toEqual(["run", "drift", "signal", "reproduction"]);
    expect(measurements).toHaveLength(2 * 4 * DEFAULT_THRESHOLDS.length);

    for (const row of measurements) {
      expect(Object.keys(row).sort()).toEqual(
        ["area", "count", "height", "pairing", "ratio", "snapshot", "threshold", "width"].sort()
      );
      expect(row.width).toBe(W);
      expect(row.height).toBe(H);
      expect(row.area).toBe(AREA);
      expect(PAIRINGS).toContain(row.pairing);
    }
  });

  it("carries no `perturbed` flag — signal-set membership is a derived predicate", () => {
    const { measurements } = measure(healthy());
    for (const row of measurements) {
      expect(row).not.toHaveProperty("perturbed");
    }
  });

  it("keeps t = 0 in the default sweep — clause 0 is evaluated there", () => {
    expect(DEFAULT_THRESHOLDS[0]).toBe(0);
  });

  it("honours an explicit sweep and sizes the row set from it", () => {
    const { measurements } = measure({ ...healthy(), thresholds: [0, 0.1] });
    expect(measurements).toHaveLength(2 * 4 * 2);
    expect([...new Set(measurements.map((m) => m.threshold))].sort()).toEqual([0, 0.1]);
  });

  it("skips no snapshot — every input name appears in every pairing", () => {
    // A skipped snapshot would lower every max and percentile, biasing the
    // answer toward LESS sensitivity: the direction of the original defect.
    const { measurements } = measure(healthy());
    for (const snapshot of ["light-alpha.png", "dark-beta.png"]) {
      for (const pairing of PAIRINGS) {
        const rows = measurements.filter((m) => m.snapshot === snapshot && m.pairing === pairing);
        expect(rows).toHaveLength(DEFAULT_THRESHOLDS.length);
      }
    }
  });
});

describe("measure — the counts are the comparator's own", () => {
  it("reports 0 for an identical pair at every sweep point (`run`)", () => {
    const { measurements } = measure(healthy());
    for (const t of DEFAULT_THRESHOLDS) {
      expect(rowFor(measurements, "light-alpha.png", "run", t).count).toBe(0);
    }
  });

  it("reports the whole image for the strong perturbation at every sweep point (`signal`)", () => {
    const { measurements } = measure(healthy());
    for (const t of DEFAULT_THRESHOLDS) {
      expect(rowFor(measurements, "light-alpha.png", "signal", t).count).toBe(AREA);
    }
  });

  it("reproduces the per-pixel filter: a small delta is counted below 0.02 and vanishes above (`drift`)", () => {
    // This is the defect in miniature — the same gate that hid a change to
    // every pixel of light-button-variants at threshold 0.2.
    const { measurements } = measure(healthy());
    for (const t of [0, 0.005, 0.01]) {
      expect(rowFor(measurements, "light-alpha.png", "drift", t).count).toBe(AREA);
    }
    for (const t of [0.02, 0.05, 0.1, 0.15, 0.2]) {
      expect(rowFor(measurements, "light-alpha.png", "drift", t).count).toBe(0);
    }
  });

  it("reports ratio as count / area", () => {
    const { measurements } = measure(healthy());
    expect(rowFor(measurements, "light-alpha.png", "signal", 0).ratio).toBe(1);
    expect(rowFor(measurements, "light-alpha.png", "run", 0).ratio).toBe(0);
  });
});

describe("shiftPngChannels — defect.md § A's reproduction, verbatim", () => {
  it("BRIGHTENS: min(255, v + D) on R, G and B, alpha untouched", () => {
    const png = new PNG({ width: 2, height: 1 });
    // pixel 0: mid-tone, headroom to spare. pixel 1: near-white, clamps.
    [100, 110, 120, 200, 250, 251, 252, 128].forEach((v, i) => {
      png.data[i] = v;
    });
    const shifted = PNG.sync.read(shiftPngChannels(PNG.sync.write(png), 36));

    expect([...shifted.data]).toEqual([136, 146, 156, 200, 255, 255, 255, 128]);
  });

  it("is a no-op at amplitude 0 and never darkens", () => {
    const png = new PNG({ width: 1, height: 1 });
    [10, 20, 30, 40].forEach((v, i) => {
      png.data[i] = v;
    });
    const source = PNG.sync.write(png);
    expect([...PNG.sync.read(shiftPngChannels(source, 0)).data]).toEqual([10, 20, 30, 40]);
    for (const d of [1, 36, 200]) {
      const out = PNG.sync.read(shiftPngChannels(source, d));
      for (let i = 0; i < 3; i += 1) expect(out.data[i]).toBeGreaterThanOrEqual(png.data[i]);
    }
  });
});

describe("measure — the fourth `reproduction` pairing", () => {
  it("derives BOTH sides from replicaA — no other leg can move it", () => {
    // replica-a is held constant while every other leg is replaced wholesale.
    const names = ["light-alpha.png", "dark-beta.png"];
    const leg = (color) => Object.fromEntries(names.map((n) => [n, flatPng(W, H, color)]));
    const rowsOf = (dirs) =>
      measure(dirs)
        .measurements.filter((m) => m.pairing === "reproduction")
        .map(({ snapshot, threshold, count, ratio }) => ({ snapshot, threshold, count, ratio }));

    const first = rowsOf(
      makeInput({
        replicaA: leg(BASE),
        replicaB: leg(BASE),
        committed: leg(NEAR),
        perturbed: leg(FAR),
      })
    );
    const second = rowsOf(
      makeInput({
        replicaA: leg(BASE),
        replicaB: leg(FAR), // wildly different noise
        committed: leg(FAR), // wildly different drift
        perturbed: leg(NEAR), // a much weaker signal
      })
    );

    expect(first).toHaveLength(names.length * DEFAULT_THRESHOLDS.length);
    expect(second).toEqual(first);
  });

  it("accepts no fourth input directory — the pairing is arithmetic, not a capture leg", () => {
    const baseline = measure(healthy()).measurements;
    const withExtra = measure({ ...healthy(), reproduction: join(root, "does-not-exist") });
    expect(withExtra.measurements).toHaveLength(baseline.length);
    expect(MODULE_SOURCE).not.toContain("--reproduction");
  });

  it("reproduces the defect at the DEFAULT amplitude: visible to t = 0.1, invisible at 0.15 and 0.2", () => {
    // defect.md § B measured the smallest FAILING uniform delta as 40/255 at
    // t = 0.15 and 53/255 at t = 0.2. The default amplitude, 36, is under both,
    // so the reproduction vanishes at exactly those two sweep points — which is
    // the defect occurring, expressed as a measurement.
    const { measurements } = measure(healthy());
    for (const t of [0, 0.005, 0.01, 0.02, 0.05, 0.1]) {
      expect(rowFor(measurements, "light-alpha.png", "reproduction", t).count).toBe(AREA);
    }
    for (const t of [0.15, 0.2]) {
      expect(rowFor(measurements, "light-alpha.png", "reproduction", t).count).toBe(0);
    }
  });

  it("is a function of the amplitude — a larger one survives further up the sweep", () => {
    const { measurements } = measure({ ...healthy(), defectAmplitude: 53 });
    expect(rowFor(measurements, "light-alpha.png", "reproduction", 0.2).count).toBe(AREA);
  });

  it("exposes the amplitude on the CLI, and defaults it so the committed workflow needs no edit", () => {
    expect(MODULE_SOURCE).toContain("--defect-amplitude");
    const workflow = readFileSync(
      resolve(ROOT, ".github/workflows/visual-noise-floor.yml"),
      "utf8"
    );
    expect(workflow).not.toContain("--defect-amplitude");
  });
});

describe("measure — provenance", () => {
  it("returns the merged tuple when all three legs agree", () => {
    const { provenance } = measure(healthy());
    expect(provenance).toEqual({ ...PROVENANCE, defectAmplitude: DEFAULT_DEFECT_AMPLITUDE });
  });

  it("echoes the RESOLVED defectAmplitude into provenance — a different amplitude is a different measurement", () => {
    expect(DEFAULT_DEFECT_AMPLITUDE).toBe(36);
    expect(measure(healthy()).provenance.defectAmplitude).toBe(36);
    expect(measure({ ...healthy(), defectAmplitude: 12 }).provenance.defectAmplitude).toBe(12);
  });

  it("refuses to difference legs whose provenance disagrees", () => {
    const dirs = healthy();
    writeFileSync(
      join(dirs.replicaB, "provenance.json"),
      JSON.stringify({ ...PROVENANCE, imageVersion: "20260720.247" })
    );
    expect(() => measure(dirs)).toThrow(/provenance/i);
    expect(() => measure(dirs)).toThrow(/imageVersion/);
  });

  it("refuses a leg with no provenance at all", () => {
    const names = ["light-alpha.png"];
    const leg = (color) => Object.fromEntries(names.map((n) => [n, flatPng(W, H, color)]));
    const dirs = makeInput(
      { replicaA: leg(BASE), replicaB: leg(BASE), committed: leg(NEAR), perturbed: leg(FAR) },
      { perturbed: null }
    );
    expect(() => measure(dirs)).toThrow(/provenance/i);
  });
});

describe("measure — every failure is hard and names the snapshot", () => {
  it("throws when a snapshot is present in one leg and absent from another", () => {
    const dirs = makeInput({
      replicaA: { "light-alpha.png": flatPng(W, H, BASE), "dark-beta.png": flatPng(W, H, BASE) },
      replicaB: { "light-alpha.png": flatPng(W, H, BASE) },
      committed: { "light-alpha.png": flatPng(W, H, NEAR), "dark-beta.png": flatPng(W, H, NEAR) },
      perturbed: { "light-alpha.png": flatPng(W, H, FAR), "dark-beta.png": flatPng(W, H, FAR) },
    });
    expect(() => measure(dirs)).toThrow(/dark-beta\.png/);
    expect(() => measure(dirs)).toThrow(/replicaB/);
  });

  it("throws on a dimension mismatch within a pair, naming the snapshot", () => {
    const dirs = makeInput({
      replicaA: { "light-alpha.png": flatPng(W, H, BASE) },
      replicaB: { "light-alpha.png": flatPng(W + 1, H, BASE) },
      committed: { "light-alpha.png": flatPng(W, H, NEAR) },
      perturbed: { "light-alpha.png": flatPng(W, H, FAR) },
    });
    expect(() => measure(dirs)).toThrow(/light-alpha\.png/);
    expect(() => measure(dirs)).toThrow(/9x4|8x4/);
  });

  it("throws on a non-PNG file, naming the snapshot", () => {
    const dirs = makeInput({
      replicaA: { "light-alpha.png": Buffer.from("not a png at all") },
      replicaB: { "light-alpha.png": flatPng(W, H, BASE) },
      committed: { "light-alpha.png": flatPng(W, H, NEAR) },
      perturbed: { "light-alpha.png": flatPng(W, H, FAR) },
    });
    expect(() => measure(dirs)).toThrow(/light-alpha\.png/);
    expect(() => measure(dirs)).toThrow(/PNG/i);
  });

  it("throws on an empty measurement input rather than emitting zero rows", () => {
    const dirs = makeInput({ replicaA: {}, replicaB: {}, committed: {}, perturbed: {} });
    expect(() => measure(dirs)).toThrow(/no snapshots/i);
  });

  it("throws when a required directory is missing", () => {
    const dirs = healthy();
    expect(() => measure({ ...dirs, replicaA: join(root, "does-not-exist") })).toThrow(
      /replicaA|does-not-exist/
    );
  });
});

describe("renderMeasurementTable", () => {
  it("renders one markdown row per sweep point, with a header", () => {
    const { measurements } = measure(healthy());
    const table = renderMeasurementTable(measurements);
    const lines = table.trim().split("\n");
    expect(lines[0]).toMatch(/^\|\s*threshold\s*\|/);
    // header + separator + one row per sweep point
    expect(lines).toHaveLength(2 + DEFAULT_THRESHOLDS.length);
    expect(table).toContain("| 0 |");
  });
});

describe("the analyzer measures THIS suite's comparator, not a lookalike", () => {
  it("resolves the installed playwright-core rather than declaring a dependency", () => {
    expect(basename(resolvePlaywrightCoreDir())).toBe("playwright-core");
  });

  it("uses getComparator('image/png') — the same entry point toHaveScreenshot uses", () => {
    expect(MODULE_SOURCE).toContain('getComparator("image/png")');
  });

  it("adds no image-comparison dependency to @mbe/scripts", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "scripts/package.json"), "utf8"));
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const forbidden of ["pixelmatch", "pngjs", "playwright", "playwright-core"]) {
      expect(declared).not.toContain(forbidden);
    }
  });
});
