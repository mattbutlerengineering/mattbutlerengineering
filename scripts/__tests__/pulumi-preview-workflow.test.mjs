import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const PREVIEW_PATH = ".github/workflows/pulumi-preview.yml";
const UP_PATH = ".github/workflows/pulumi-up.yml";

const PREVIEW = readFileSync(resolve(ROOT, PREVIEW_PATH), "utf8");
const UP = readFileSync(resolve(ROOT, UP_PATH), "utf8");

/**
 * Shape test for the read-only Pulumi preview carrier.
 *
 * `pulumi-preview.yml` runs the Pulumi engine against the PRODUCTION stack. It
 * is safe only because of a handful of properties that are individually one
 * character away from being wrong: dispatch-only, `preview` and nothing else,
 * no refresh, `contents: read`, an exact CLI pin, and a gen build whose inputs
 * match `pulumi-up.yml`'s exactly. None of those properties has a natural
 * failure — a workflow that quietly gained `command: up` or lost its pin looks
 * completely normal and goes green. This file is what makes them fail loudly.
 *
 * Parsed textually rather than with a YAML library, matching the precedent in
 * pulumi-cli-pin.test.mjs, ci-node-matrix.test.mjs and drift-fix-workflow.test.mjs:
 * nothing in `scripts/` depends on a YAML parser, and these are plain scalars
 * with no anchors or flow mappings to get wrong.
 */
const PINNED_VERSION = "3.253.0";

/** Lines with the comment stripped — a `#` line must never satisfy an assertion. */
function withoutComments(source) {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

/** The indented body of a top-level `key:` mapping, up to the next top-level line. */
function topLevelBlock(source, key) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l === `${key}:`);
  if (start === -1) throw new Error(`${key}: not found at top level`);
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (/^\S/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body;
}

/** Every `- name: …` step, in file order, each carrying its own lines. */
function steps(source) {
  const lines = source.split("\n");
  const starts = [];
  lines.forEach((l, i) => {
    if (/^\s+- name:\s/.test(l)) starts.push(i);
  });
  return starts.map((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
    const chunk = lines.slice(start, end);
    return {
      index: n,
      name: chunk[0].replace(/^\s+- name:\s*/, "").trim(),
      lines: chunk,
      text: chunk.join("\n"),
    };
  });
}

/** The shell body of a step's `run:`, or null when the step has none. */
function runBody(step) {
  const i = step.lines.findIndex((l) => /^\s*run:/.test(l));
  if (i === -1) return null;
  const [, indent, inline] = step.lines[i].match(/^(\s*)run:\s*(.*)$/);
  const trimmed = inline.trim();
  if (trimmed !== "" && trimmed !== "|" && trimmed !== "|-" && trimmed !== ">") return trimmed;

  const body = [];
  for (let j = i + 1; j < step.lines.length; j++) {
    const line = step.lines[j];
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (line.match(/^(\s*)/)[1].length <= indent.length) break;
    body.push(line.slice(indent.length + 2));
  }
  return body.join("\n").replace(/\s+$/, "");
}

/** `NAME: value` pairs from a step's `env:` block, in file order. */
function stepEnv(step) {
  const i = step.lines.findIndex((l) => /^\s*env:\s*$/.test(l));
  if (i === -1) return [];
  const indent = step.lines[i].match(/^(\s*)/)[1].length;
  const pairs = [];
  for (let j = i + 1; j < step.lines.length; j++) {
    const line = step.lines[j];
    if (line.trim() === "") continue;
    if (line.match(/^(\s*)/)[1].length <= indent) break;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) pairs.push([m[1], m[2].trim()]);
  }
  return pairs;
}

const previewSteps = steps(PREVIEW);
const stepNamed = (name) => {
  const found = previewSteps.find((s) => s.name === name);
  if (!found) throw new Error(`${PREVIEW_PATH} has no step named ${name}`);
  return found;
};
const genBuildStep = (source) => {
  const found = steps(source).find((s) =>
    (runBody(s) ?? "").includes("pnpm build --filter=@mbe/gen")
  );
  if (!found) throw new Error("no gen-build step found");
  return found;
};
const bundleStep = (source) => {
  const found = steps(source).find((s) => (runBody(s) ?? "").includes("esbuild"));
  if (!found) throw new Error("no esbuild bundle step found");
  return found;
};

describe("pulumi-preview.yml — trigger surface (4.1a)", () => {
  it("triggers on workflow_dispatch and nothing else", () => {
    // A `push:`, `schedule:` or `workflow_run:` here would run the Pulumi engine
    // against production unattended. Dispatch-only is what keeps every run a
    // deliberate human act — and it is also why the file has to live on the
    // default branch at all (GitHub accepts workflow_dispatch only there).
    const triggers = topLevelBlock(PREVIEW, "on")
      .filter((l) => /^ {2}\S/.test(l))
      .map((l) => l.trim().replace(/:.*$/, ""));
    expect(triggers).toEqual(["workflow_dispatch"]);
  });
});

describe("pulumi-preview.yml — read-only bound (4.1d, 4.1e)", () => {
  it("runs no Pulumi command other than preview", () => {
    const commands = withoutComments(PREVIEW)
      .split("\n")
      .filter((l) => /^\s*command:\s*/.test(l))
      .map((l) =>
        l
          .split("command:")[1]
          .trim()
          .replace(/^["']|["']$/g, "")
      );
    expect(commands).toEqual(["preview"]);
  });

  it("invokes no mutating pulumi verb anywhere in the file", () => {
    // `pulumi-up.yml`'s `Pulumi Cancel + Clear Pending Operations` preamble is
    // the tempting one to copy — it reads like setup, and it rewrites the
    // checkpoint via `stack export | stack import`. Copying it would make this
    // workflow a mutation with a read-only name.
    const body = withoutComments(PREVIEW);
    for (const verb of [
      /\bpulumi\s+up\b/,
      /\bpulumi\s+destroy\b/,
      /\bpulumi\s+refresh\b/,
      /\bpulumi\s+cancel\b/,
      /\bpulumi\s+import\b/,
      /\bpulumi\s+stack\s+(import|export|rm)\b/,
      /\bpulumi\s+state\s+delete\b/,
      /\bpulumi\s+config\s+set\b/,
    ]) {
      expect(body).not.toMatch(verb);
    }
  });

  it("never refreshes — refresh writes the state file", () => {
    const refreshValues = withoutComments(PREVIEW)
      .split("\n")
      .filter((l) => /^\s*refresh:\s*/.test(l))
      .map((l) => l.split("refresh:")[1].trim());
    // Explicitly declared false rather than left to the action's default, so the
    // intent is visible in the file and pinned here.
    expect(refreshValues).toEqual(["false"]);
  });

  it("grants contents: read and no other permission", () => {
    const perms = topLevelBlock(PREVIEW, "permissions").map((l) => l.trim());
    expect(perms).toEqual(["contents: read"]);
  });
});

describe("pulumi-preview.yml — Pulumi CLI pin (4.1c)", () => {
  it("installs an explicit CLI version instead of inheriting the runner image's", () => {
    // Same reason as pulumi-up.yml: the 2026-08-11 ubuntu24 image bump took the
    // preinstalled Pulumi 3.253.0 → 3.256.0, whose S3 blob layer sends upload
    // checksums Cloudflare R2 rejects (InvalidDigest). A preview on a different
    // engine answers a different question than the one that will apply.
    const versions = [...PREVIEW.matchAll(/--version\s+(\S+)/g)].map((m) => m[1]);
    expect(versions).toEqual([PINNED_VERSION]);
    expect(PREVIEW).toMatch(/\$HOME\/\.pulumi\/bin"? >> "?\$GITHUB_PATH/);
  });

  it("pins every pulumi/actions step to the same exact version", () => {
    const actionSteps = PREVIEW.split("\n").filter((l) => /uses:\s*pulumi\/actions@/.test(l));
    expect(actionSteps.length).toBeGreaterThan(0);

    const pins = PREVIEW.split("\n").filter((l) => /^\s*pulumi-version:/.test(l));
    expect(pins).toHaveLength(actionSteps.length);
    for (const pin of pins) {
      const value = pin
        .split("pulumi-version:")[1]
        .trim()
        .replace(/^["']|["']$/g, "");
      expect(value).toBe(PINNED_VERSION);
    }
  });

  it("leaves no Pulumi invocation resolving to a floating version", () => {
    expect(PREVIEW).not.toMatch(/pulumi-version:\s*["']?\^?3["']?\s*$/m);
    expect(PREVIEW).not.toMatch(/pulumi-version:\s*["']?latest["']?\s*$/m);
  });

  it("installs the pin before anything that shells out to pulumi", () => {
    // GITHUB_PATH only affects steps *after* the one that writes it, so a pin
    // step sitting below its consumers satisfies every other assertion here
    // while the consumers still resolve the runner image's floating binary.
    const pin = stepNamed("Pin Pulumi CLI");
    const consumers = previewSteps.filter(
      (s) =>
        s !== pin &&
        (/uses:\s*pulumi\/actions@/.test(s.text) || /\bpulumi\s/.test(runBody(s) ?? ""))
    );
    expect(consumers.length).toBeGreaterThan(0);
    for (const consumer of consumers) {
      expect(pin.index).toBeLessThan(consumer.index);
    }
  });
});

describe("pulumi-preview.yml — build prerequisites (4.1b)", () => {
  it("installs deps, builds gen, and bundles the worker before previewing", () => {
    // `index.ts` reads apps/gen/dist and infrastructure/worker/dist/edge-router.js
    // straight off disk, and both are gitignored — without all three steps the
    // program throws before producing any diff at all.
    const install = previewSteps.findIndex((s) =>
      (runBody(s) ?? "").includes("pnpm install --frozen-lockfile")
    );
    const gen = genBuildStep(PREVIEW).index;
    const bundle = bundleStep(PREVIEW).index;
    const preview = previewSteps.findIndex((s) => /uses:\s*pulumi\/actions@/.test(s.text));

    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(gen);
    expect(gen).toBeLessThan(preview);
    expect(bundle).toBeLessThan(preview);
    expect(runBody(bundleStep(PREVIEW))).toContain(
      "--outfile=infrastructure/worker/dist/edge-router.js"
    );
  });
});

describe("pulumi-preview.yml — pipefail on gate commands (4.1f)", () => {
  it("opens every piping run block with set -o pipefail", () => {
    // GitHub's default shell is `bash -e {0}` — `-e` only. A piped gate command
    // reports the *pipe's* exit code, so `curl … | sh` goes green when curl
    // fails and nothing gets installed.
    for (const step of previewSteps) {
      const body = runBody(step);
      if (!body) continue;
      const effective = body
        .split("\n")
        .filter((l) => !l.trim().startsWith("#"))
        .join("\n");
      const pipes = effective.replace(/\|\|/g, "").includes("|");
      if (!pipes) continue;

      const firstCommand = effective.split("\n").find((l) => l.trim() !== "");
      expect(
        firstCommand,
        `step "${step.name}" pipes but does not open with a pipefail-setting line`
      ).toMatch(/^set\s+-\S+\s+pipefail\b/);
    }
  });
});

describe("pulumi-preview.yml — bundle fingerprint (4.1h)", () => {
  it("emits a sha256 and an originRoutes occurrence count for the bundled worker", () => {
    // `WorkersScript.content` is one opaque bundled string: a rendered `~ content`
    // diff proves the bundle changed, never that it changed correctly. The
    // occurrence count is the positive proof that the edge change is inside the
    // artifact Pulumi read; the hash proves nothing on its own today and exists
    // so a later run can tell whether it read the same bundle.
    // Matched on the command substitution, not the bare string `sha256sum`:
    // the step also *echoes* the word, so a looser match would keep passing
    // over a step that had stopped computing anything.
    const fingerprint = previewSteps.find((s) => /\$\(\s*sha256sum\s/.test(runBody(s) ?? ""));
    expect(fingerprint, "no step computes a sha256sum").toBeTruthy();

    const body = runBody(fingerprint);
    expect(body).toContain("infrastructure/worker/dist/edge-router.js");
    expect(body).toMatch(/grep\s+-o\s+-F\s+'originRoutes'/);
    // Both numbers have to be readable by a human after the run, not merely
    // computed: 4.5 copies them into preview.txt.
    expect(body).toContain("$GITHUB_STEP_SUMMARY");

    expect(fingerprint.index).toBeGreaterThan(bundleStep(PREVIEW).index);
  });
});

describe("build-input parity with pulumi-up.yml (4.1g)", () => {
  it("builds gen with the same env var NAME SET as pulumi-up.yml", () => {
    // The mandated cross-file assertion. A different build env produces a
    // different asset manifest, which surfaces as a diff on the
    // `mattbutlerengineering-gen` WorkersScript — a resource this run never
    // touches, whose diff is read as a finding. Carrier drift would therefore be
    // misread as a defect in the change under preview. Reading BOTH files is the
    // point: an edit to either one has to break this, not just an edit here.
    const previewNames = stepEnv(genBuildStep(PREVIEW))
      .map(([name]) => name)
      .sort();
    const upNames = stepEnv(genBuildStep(UP))
      .map(([name]) => name)
      .sort();

    expect(upNames.length).toBeGreaterThan(0);
    expect(previewNames).toEqual(upNames);
  });

  it("builds gen with the same values and secret expressions as pulumi-up.yml", () => {
    // Name parity alone is not enough — a matching name pointing at a different
    // secret or a different VITE_API_URL produces exactly the same spurious diff.
    expect(stepEnv(genBuildStep(PREVIEW))).toEqual(stepEnv(genBuildStep(UP)));
  });

  it("bundles the worker with the same esbuild invocation, flag for flag", () => {
    const normalize = (body) => body.replace(/\\\n/g, " ").split(/\s+/).filter(Boolean);
    expect(normalize(runBody(bundleStep(PREVIEW)))).toEqual(normalize(runBody(bundleStep(UP))));
  });
});
