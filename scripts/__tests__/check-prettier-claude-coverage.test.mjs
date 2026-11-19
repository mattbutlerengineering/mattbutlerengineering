import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prettierArgs, shippedRunIgnoreLines, PRETTIER_TARGETS } from "../check-prettier.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const PRETTIER_BIN = resolve(ROOT, "node_modules/.bin/prettier");
const PROBE_PATH = resolve(ROOT, ".claude/rules/__prettier_coverage_probe.md");

// `check:prettier` is a thin wrapper (#9078) that skips shipped pipeline runs;
// the prettier targets it passes are the exported PRETTIER_TARGETS.
const WRAPPER = "scripts/check-prettier.mjs";
const CHECK_SCRIPT = `${PKG.scripts["check:prettier"]} ${prettierArgs()
  .map((a) => `"${a}"`)
  .join(" ")}`;

// Extracts the explicit `.claude` markdown glob target from the effective
// prettier invocation, e.g. `... "<glob>"` -> `<glob>`.
function extractClaudeGlob(script) {
  const match = script.match(/"(\.claude\/[^"]*\.md)"/);
  return match ? match[1] : null;
}

// Guards #5787: `.claude` markdown must be prettier-checked explicitly, not
// left to rely on bare `prettier --check .` traversal.
//
// Measured mechanism (not the one the issue guessed): `prettier --check .`
// DOES traverse into `.claude/` for tracked files — verified directly against
// this repo's prettier 3.9.8 with fresh, non-ignored probe files. The real
// gap is narrower: prettier respects `.gitignore` by default (confirmed with
// a `*.log`-pattern probe outside `.claude/` entirely), and
// `.gitignore`'s `/.claude/improvement-loop/*` rule (everything in that dir
// except `log.md`/`revert-log.md`) is therefore silently exempt from any
// `prettier --check .` run — correctly so, since those are untracked runtime
// artifacts, not instruction surface. An explicit glob target doesn't change
// what gets matched today (it's still subject to the same ignore
// resolution), but it turns ".claude markdown is checked" from an accident of
// traversal into a stated, pinned intent that a future
// `.prettierignore`/`.gitignore` change can't silently defeat without also
// breaking this test.
describe("check:prettier covers .claude/** markdown explicitly", () => {
  afterEach(() => {
    if (existsSync(PROBE_PATH)) rmSync(PROBE_PATH);
  });

  it("pins an explicit .claude/**/*.md target in the check:prettier script", () => {
    expect(PKG.scripts["check:prettier"]).toBe(`node ${WRAPPER}`);
    expect(extractClaudeGlob(CHECK_SCRIPT)).toBe(".claude/**/*.md");
    // Whole repo stays in scope: only shipped-run markdown is ever ignored.
    expect(PRETTIER_TARGETS).toContain(".");
  });

  it("actually catches malformed markdown under .claude/ (RED before GREEN)", () => {
    const claudeGlob = extractClaudeGlob(CHECK_SCRIPT);
    expect(claudeGlob).toBeTruthy();

    // Trailing whitespace is a formatting violation prettier always flags,
    // regardless of surrounding markdown context (unlike bullet-marker style,
    // which prettier can legitimately preserve for list-separation reasons).
    writeFileSync(PROBE_PATH, "# Probe\n\nTrailing whitespace.   \n");

    const result = spawnSync(PRETTIER_BIN, ["--check", claudeGlob], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("__prettier_coverage_probe.md");
  });
});

// Guards #9078: shipped runs (a tracked `retro.md`) are skipped; live runs and
// every other markdown file are still checked.
describe("check:prettier skips shipped pipeline runs only (#9078)", () => {
  const SHIPPED_DIR = "docs/features/booking-guest-reuse"; // tracked, has retro.md
  const LIVE_DIR = "docs/features/__prettier_probe_live"; // no retro.md
  const BAD = "# Probe\n\nTrailing whitespace.   \n";
  const probes = [
    resolve(ROOT, SHIPPED_DIR, "__probe_shipped.md"),
    resolve(ROOT, LIVE_DIR, "__probe_live.md"),
    resolve(ROOT, "docs/__probe_plain.md"),
  ];

  afterEach(() => {
    rmSync(resolve(ROOT, LIVE_DIR), { recursive: true, force: true });
    for (const p of probes) rmSync(p, { force: true });
  });

  it("builds ignore globs for shipped runs only", () => {
    expect(
      shippedRunIgnoreLines([
        "docs/features/a/retro.md",
        "docs/features/a/prd.md",
        "docs/fixes/b/retro.md",
        "docs/features/live/prd.md",
      ])
    ).toEqual(["docs/features/a/**/*.md", "docs/fixes/b/**/*.md"]);
  });

  it("skips a shipped-run file but still flags live-run and non-run markdown", () => {
    expect(existsSync(resolve(ROOT, SHIPPED_DIR, "retro.md"))).toBe(true);
    mkdirSync(resolve(ROOT, LIVE_DIR), { recursive: true });
    for (const p of probes) writeFileSync(p, BAD);

    const result = spawnSync("node", [resolve(ROOT, WRAPPER)], { cwd: ROOT, encoding: "utf8" });
    const output = result.stdout + result.stderr;

    expect(result.status).not.toBe(0);
    expect(output).toContain("__probe_live.md");
    expect(output).toContain("__probe_plain.md");
    expect(output).not.toContain("__probe_shipped.md");
    // The wrapper's temporary ignore file is cleaned up.
    expect(readdirSync(ROOT).filter((f) => f.startsWith(".check-prettier-"))).toEqual([]);
  }, 120_000);
});
