import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const UP_PATH = ".github/workflows/pulumi-up.yml";
const PREVIEW_PATH = ".github/workflows/pulumi-preview.yml";
const PROGRAM_DIR = "infrastructure/pulumi";

const UP = readFileSync(resolve(ROOT, UP_PATH), "utf8");
const PREVIEW = readFileSync(resolve(ROOT, PREVIEW_PATH), "utf8");

/**
 * Guard for a TEMPORARY bypass — delete this file in the PR that removes it.
 *
 * Two Auth0 records (`Tenant mattbutlerengineering-tenant` and `Branding
 * mattbutlerengineering-branding`) were written into prod Pulumi state by
 * #4924 (applied 2026-09-09T17:05Z, 403 on `update:*`) and orphaned by revert
 * #5165. The Pulumi M2M grant lacks `read:tenant_settings` / `read:branding`,
 * so `pulumi refresh` 403s on both records and `pulumi-up.yml` has skipped
 * `Pulumi Up` on every run since (#5169, #4848). Until a human either grants
 * the scopes or deletes the two records from state, the workflows carry an
 * `exclude:` list naming exactly those two URNs on refresh, up and preview.
 *
 * This file keeps that bypass exact, scoped, mirrored and explained:
 *   1. refresh + up in pulumi-up.yml exclude exactly the two orphan URNs;
 *   2. pulumi-preview.yml's single pulumi/actions step carries the identical list;
 *   3. no other step excludes anything, and nothing widens the exclusion
 *      (`exclude-dependents`, `target`, `continue-on-error`);
 *   4. every excluded URN is a prod-stack Auth0 Tenant/Branding literal;
 *   5. a TEMPORARY BYPASS marker comment naming the removal recipe sits
 *      directly above each `exclude:` block;
 *   6. the program does not re-declare `auth0.Tenant` / `auth0.Branding` while
 *      the bypass exists — `up --exclude` would silently skip the re-declared
 *      resources and leave the stale records in state under a green run.
 *
 * Removal condition and ordering: docs/fixes/pulumi-refresh-blocks-apply/release.md
 *
 * Parsed textually rather than with a YAML library, matching the precedent in
 * pulumi-cli-pin.test.mjs and pulumi-preview-workflow.test.mjs: nothing in
 * `scripts/` depends on a YAML parser. The step/comment helpers below are
 * copied from pulumi-preview-workflow.test.mjs rather than imported, so the
 * removal PR deletes exactly one file and touches neither existing guard.
 */

const ORPHAN_URNS = [
  "urn:pulumi:prod::mbe-infrastructure::auth0:index/tenant:Tenant::mattbutlerengineering-tenant",
  "urn:pulumi:prod::mbe-infrastructure::auth0:index/branding:Branding::mattbutlerengineering-branding",
];

// Scoped to the prod stack and to exactly these two Auth0 resource types. The
// character class also forbids `*` (wildcards are never existence-checked by
// the engine), quotes, and `,` (the action splits each line on commas).
const URN_SHAPE =
  /^urn:pulumi:prod::mbe-infrastructure::auth0:index\/(tenant:Tenant|branding:Branding)::[A-Za-z0-9-]+$/;

const MARKER = "# TEMPORARY BYPASS — maintenance:pulumi-refresh-blocks-apply";
const RECIPE = "docs/fixes/pulumi-refresh-blocks-apply/release.md";

const REFRESH_STEP = "Pulumi Refresh (Sync state with cloud)";
const UP_STEP = "Pulumi Up";

// Key matchers, written out rather than built from strings: a pattern
// interpolated from a variable needs hand-escaping, which CodeQL flags
// (js/incomplete-sanitization) and which would silently mis-match anyway.
const EXCLUDE_KEY = /^\s*exclude:/;
const EXCLUDE_DEPENDENTS_KEY = /^\s*exclude-dependents:/;
const TARGET_KEY = /^\s*target:/;
const CONTINUE_ON_ERROR = /continue-on-error/;
const LITERAL_BLOCK_INDICATOR = /^\|[+-]?$/;

/** Lines with the comment stripped — a `#` line must never satisfy an assertion. */
function withoutComments(source) {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
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

const indentOf = (line) => line.match(/^(\s*)/)[1].length;

/** Non-comment lines anywhere in the file that match `re`. */
function linesMatching(source, re) {
  return withoutComments(source)
    .split("\n")
    .filter((l) => re.test(l));
}

/**
 * The `exclude:` input on a step's `with:` mapping, or null when the step has
 * none. `lines` are the non-empty trimmed lines of its value; `indicator` is
 * the YAML scalar indicator. It has to be the literal block scalar `|`: the
 * action reads the input with `getMultilineInput`, which splits on newlines,
 * so a folded `>` would join both URNs into one garbage entry that refresh
 * rejects and preview silently ignores.
 */
function excludeInput(step) {
  const withIdx = step.lines.findIndex((l) => /^\s*with:\s*$/.test(l));
  if (withIdx === -1) return null;
  const withIndent = indentOf(step.lines[withIdx]);
  let keyIdx = -1;
  for (let i = withIdx + 1; i < step.lines.length; i++) {
    const line = step.lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (indentOf(line) <= withIndent) break;
    if (EXCLUDE_KEY.test(line)) {
      keyIdx = i;
      break;
    }
  }
  if (keyIdx === -1) return null;

  const keyLine = step.lines[keyIdx];
  const keyIndent = indentOf(keyLine);
  const inline = keyLine.replace(EXCLUDE_KEY, "").trim();
  if (inline !== "" && !/^[|>][+-]?$/.test(inline)) return { indicator: "inline", lines: [inline] };

  const lines = [];
  for (let j = keyIdx + 1; j < step.lines.length; j++) {
    const line = step.lines[j];
    if (line.trim() === "") continue;
    if (indentOf(line) <= keyIndent) break;
    // Inside a block scalar every line is content — a `#` here is a URN, not a comment.
    lines.push(line.trim());
  }
  return { indicator: inline, lines };
}

/** The contiguous run of comment lines immediately above line `idx`, joined. */
function commentBlockAbove(lines, idx) {
  const block = [];
  for (let i = idx - 1; i >= 0 && lines[i].trim().startsWith("#"); i--) block.unshift(lines[i]);
  return block.join("\n");
}

const sorted = (arr) => [...arr].sort();

// Each file is split into steps exactly once, so the named steps and the
// "every other step" filters below compare the same objects by identity.
const upSteps = steps(UP);
const previewSteps = steps(PREVIEW);

const stepNamed = (fileSteps, path, name) => {
  const found = fileSteps.find((s) => s.name === name);
  if (!found) throw new Error(`${path} has no step named ${name}`);
  return found;
};

const upRefresh = stepNamed(upSteps, UP_PATH, REFRESH_STEP);
const upUp = stepNamed(upSteps, UP_PATH, UP_STEP);
const previewActionSteps = previewSteps.filter((s) => /uses:\s*pulumi\/actions@/.test(s.text));

describe(`${UP_PATH} — orphan exclusion on refresh and up (invariant 1)`, () => {
  for (const step of [upRefresh, upUp]) {
    it(`"${step.name}" excludes exactly the two orphaned Auth0 URNs, verbatim, as a literal block scalar`, () => {
      const input = excludeInput(step);
      expect(
        input,
        `${UP_PATH} step "${step.name}" has no exclude: input under with:`
      ).not.toBeNull();
      expect(input.indicator).toMatch(LITERAL_BLOCK_INDICATOR);
      expect(input.lines).toHaveLength(2);
      expect(sorted(input.lines)).toEqual(sorted(ORPHAN_URNS));
    });
  }
});

describe(`${PREVIEW_PATH} — exclusion parity (invariant 2)`, () => {
  it("carries the identical exclusion list on its single pulumi/actions step", () => {
    // The 4.1g pattern: reading BOTH files is the point. A preview that plans a
    // different operation than the apply answers a different question.
    expect(previewActionSteps).toHaveLength(1);
    const [previewStep] = previewActionSteps;
    const input = excludeInput(previewStep);
    expect(
      input,
      `${PREVIEW_PATH} step "${previewStep.name}" has no exclude: input under with:`
    ).not.toBeNull();
    expect(input.indicator).toMatch(LITERAL_BLOCK_INDICATOR);
    expect(sorted(input.lines)).toEqual(sorted(ORPHAN_URNS));
    // Byte-for-byte, in order, against both up-side lists.
    expect(input.lines).toEqual(excludeInput(upRefresh)?.lines);
    expect(input.lines).toEqual(excludeInput(upUp)?.lines);
  });
});

describe("scope of the bypass (invariant 3)", () => {
  it("adds exclude: to no step other than refresh, up and preview", () => {
    for (const s of upSteps.filter((s) => s !== upRefresh && s !== upUp)) {
      expect(excludeInput(s), `${UP_PATH} step "${s.name}" carries exclude:`).toBeNull();
    }
    for (const s of previewSteps.filter((s) => !previewActionSteps.includes(s))) {
      expect(excludeInput(s), `${PREVIEW_PATH} step "${s.name}" carries exclude:`).toBeNull();
    }
    // And none outside any step: every exclude: line in each file is one of
    // the named steps' own. (Also what keeps a trailing job's `with:` honest —
    // the step splitter folds unnamed steps into the last named one.)
    const upOwned = [upRefresh, upUp].filter((s) => excludeInput(s) !== null).length;
    expect(linesMatching(UP, EXCLUDE_KEY)).toHaveLength(upOwned);
    const previewOwned = previewActionSteps.filter((s) => excludeInput(s) !== null).length;
    expect(linesMatching(PREVIEW, EXCLUDE_KEY)).toHaveLength(previewOwned);
  });

  it("never widens the exclusion with exclude-dependents, target or continue-on-error", () => {
    // `exclude-dependents: true` would drag every dependent of the two records
    // out of the plan; `target:` is mutually exclusive with `exclude` on the
    // CLI (`MarkFlagsMutuallyExclusive`) and errors the step; `continue-on-error`
    // in either form (step key or `with:` input) turns a real refresh failure
    // into a green run. The bypass is a scoped exclusion, never a blanket one.
    for (const [path, source] of [
      [UP_PATH, UP],
      [PREVIEW_PATH, PREVIEW],
    ]) {
      const dependents = linesMatching(source, EXCLUDE_DEPENDENTS_KEY).map((l) =>
        l.split("exclude-dependents:")[1].trim()
      );
      expect(
        dependents.filter((v) => v !== "false"),
        `${path} sets exclude-dependents to something other than false`
      ).toEqual([]);
      expect(linesMatching(source, TARGET_KEY), `${path} carries target:`).toEqual([]);
      expect(linesMatching(source, CONTINUE_ON_ERROR), `${path} carries continue-on-error`).toEqual(
        []
      );
    }
  });
});

describe("URN shape (invariant 4)", () => {
  it("excludes only prod-stack Auth0 Tenant/Branding literals — no wildcards, quotes or commas", () => {
    const excluded = [upRefresh, upUp, ...previewActionSteps].flatMap(
      (s) => excludeInput(s)?.lines ?? []
    );
    expect(excluded.filter((urn) => !URN_SHAPE.test(urn))).toEqual([]);
  });
});

describe("removal record (invariant 5)", () => {
  for (const [path, source] of [
    [UP_PATH, UP],
    [PREVIEW_PATH, PREVIEW],
  ]) {
    it(`${path} carries the TEMPORARY BYPASS marker and names the release.md recipe on comment lines`, () => {
      const comments = source.split("\n").filter((l) => l.trim().startsWith("#"));
      expect(
        comments.some((l) => l.includes(MARKER)),
        `${path} has no comment line containing "${MARKER}"`
      ).toBe(true);
      expect(
        comments.some((l) => l.includes(RECIPE)),
        `${path} has no comment line naming ${RECIPE}`
      ).toBe(true);
    });

    it(`${path} places the marker and the recipe directly above every exclude: block`, () => {
      // The "why" and the recipe travel with the "what": a future session
      // reading the step must not have to search the file for the reason.
      const lines = source.split("\n");
      const unmarked = lines
        .map((l, i) => (!l.trim().startsWith("#") && EXCLUDE_KEY.test(l) ? i : -1))
        .filter((i) => i !== -1)
        .filter((i) => {
          const above = commentBlockAbove(lines, i);
          return !(above.includes(MARKER) && above.includes(RECIPE));
        })
        .map((i) => `${path}:${i + 1}`);
      expect(unmarked, "exclude: blocks without the marker + recipe directly above").toEqual([]);
    });
  }
});

describe("program incompatibility (invariant 6)", () => {
  it("refuses a re-declared auth0.Tenant / auth0.Branding while the bypass exists", () => {
    // Re-landing #4924 with the bypass in place would let `up --exclude` skip
    // the re-declared resources (`isExcludedFromUpdate`) and leave the stale
    // records in state with a green run. Vacuous while no bypass exists — once
    // the exclude: blocks are gone this file is deleted with them.
    const bypassActive = linesMatching(UP, EXCLUDE_KEY).length > 0;
    const dir = resolve(ROOT, PROGRAM_DIR);
    const redeclaring = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /auth0\.(Tenant|Branding)\(/.test(readFileSync(resolve(dir, f), "utf8")));
    expect(
      bypassActive ? redeclaring : [],
      `${PROGRAM_DIR} re-declares an excluded resource while the bypass is active — retire the bypass first`
    ).toEqual([]);
  });
});
