import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const PRETTIER_BIN = resolve(ROOT, "node_modules/.bin/prettier");
const PROBE_PATH = resolve(ROOT, ".claude/rules/__prettier_coverage_probe.md");

const CHECK_SCRIPT = PKG.scripts["check:prettier"];

// Extracts the explicit `.claude` markdown glob target from the
// `check:prettier` script string, e.g. `prettier --check . "<glob>"` -> `<glob>`.
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
    expect(extractClaudeGlob(CHECK_SCRIPT)).toBe(".claude/**/*.md");
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
