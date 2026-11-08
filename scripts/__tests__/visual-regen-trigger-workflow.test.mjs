/**
 * Guards for .github/workflows/visual-regen-trigger.yml's step-output
 * handling.
 *
 * A `run:` body that interpolates `${{ steps.*.outputs.* }}` / `${{
 * needs.*.outputs.* }}` directly is unsafe: GitHub Actions substitutes
 * `${{ }}` into the script TEXT before bash ever parses it, so an untrusted
 * value (here, `visual-regen-trigger.mjs`'s derived `grep`, which can contain
 * `|` from a multi-title alternation, or in principle a failing spec's own
 * title text) becomes shell SYNTAX rather than a quoted argument. A `grep`
 * with 2+ failing titles — the common case for a layout-wide visual change —
 * reproduces this today as a literal shell pipe. `env:` avoids it entirely:
 * the value reaches bash as a variable, never as script text.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractRunBlocks } from "../check-pipe-to-shell-pipefail.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/visual-regen-trigger.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

/** A step/needs output read directly as script TEXT, not via `env:`. */
const UNSAFE_OUTPUT_INTERPOLATION = /\$\{\{\s*(?:steps|needs)\.[\w.-]+\.outputs\.[\w.-]+\s*\}\}/;

describe("visual-regen-trigger.yml never interpolates a step/needs output directly into a run: body", () => {
  const blocks = extractRunBlocks(WORKFLOW);

  it("has at least one run: block to check (sanity)", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it.each(blocks.map((b) => [b.line, b.body]))("line %i", (line, body) => {
    expect(body).not.toMatch(UNSAFE_OUTPUT_INTERPOLATION);
  });
});

describe("visual-regen-trigger.yml's Summarize step survives a multi-title grep (shell-level proof)", () => {
  const summarizeBlock = extractRunBlocks(WORKFLOW).find((b) =>
    b.body.includes("Visual regen trigger")
  );

  it("is found (the step must still exist under this name)", () => {
    expect(summarizeBlock).toBeTruthy();
  });

  it("exits 0 and writes the literal multi-title grep text, unexecuted, when DISPATCH_JSON contains a `|`", () => {
    // Two failing titles for one app — buildGrepPattern's real output shape —
    // alternated with `|`, which is a shell pipe once naively interpolated.
    const dispatchJson = JSON.stringify([
      {
        app: "marketing",
        grep: "/ @ 1280x720|/status @ 1280x720",
        branch: "automation/visual-baseline-regen/marketing",
        titleCount: 2,
      },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "visual-regen-trigger-workflow-"));
    const summaryFile = join(dir, "summary.md");
    try {
      const result = spawnSync("bash", ["-c", `set -o pipefail\n${summarizeBlock.body}`], {
        env: {
          PATH: process.env.PATH,
          DISPATCH_JSON: dispatchJson,
          SKIPPED_JSON: "[]",
          GITHUB_STEP_SUMMARY: summaryFile,
        },
        encoding: "utf8",
      });

      // Before the `env:` fix, this exact DISPATCH_JSON made bash treat the
      // `|` as a real pipe: piping `}` output into a token that is not a
      // command exits 126 under `bash -e`. After the fix it is plain text.
      expect(result.status).toBe(0);

      const summary = readFileSync(summaryFile, "utf8");
      expect(summary).toContain("/ @ 1280x720|/status @ 1280x720");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
