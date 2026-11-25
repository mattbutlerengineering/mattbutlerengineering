import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTOMATION_MARKER } from "../lib/automation-marker.mjs";

// #9428: every comment this repo's automation writes must carry the hidden
// marker, or the stale-human-blocked detector counts it as a human touch.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const POSTS_COMMENT =
  /gh (issue|pr) comment|createComment|issues\/(\$\{[^}]+\}|[^\s"'`/]+)\/comments`?,?\s*$|issues\/\$\{[^}]+\}\/comments`,/m;

// Deliberate exceptions. A file here posts comments without the marker, with
// the reason it is safe.
const SCRIPT_ALLOWLIST = {
  "publish-visual-diffs.mjs":
    "standing comment found by its own `<!-- visual-diffs-in-pr ... -->` prefix; body is built elsewhere",
  "reviewed-merge.mjs":
    "reads comments only; the `reviewed-merge:` first line is a parsed contract",
  "collect-shipped-features.mjs": "reads comments only",
  "visual-diff-comment.mjs": "builds the standing-comment prefix; posting is publish-visual-diffs",
  "close-recovered-regressions.mjs": null, // marked
};
const WORKFLOW_REASON =
  "posts with GITHUB_TOKEN as github-actions[bot], already excluded by isBotActor()";

describe("automation comment marker coverage (#9428)", () => {
  it("every docs/routines/mbe-*.md prompt instructs the routine to add the marker", () => {
    const files = readdirSync(join(root, "docs/routines")).filter((f) => /^mbe-.*\.md$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const missing = files.filter((f) => !read(`docs/routines/${f}`).includes(AUTOMATION_MARKER));
    expect(missing).toEqual([]);
  });

  it("every script that posts a comment uses the marker or is allowlisted", () => {
    const files = readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".mjs"));
    const offenders = files.filter((f) => {
      const src = read(`scripts/${f}`);
      if (!POSTS_COMMENT.test(src) && !/issues\/\$\{[^}]+\}\/comments/.test(src)) return false;
      if (src.includes("AUTOMATION_MARKER")) return false;
      return !(f in SCRIPT_ALLOWLIST) || SCRIPT_ALLOWLIST[f] === null;
    });
    expect(offenders).toEqual([]);
  });

  it("workflows that comment never do so with the PAT-backed human login", () => {
    // Allowlisted by reason WORKFLOW_REASON: GITHUB_TOKEN comments are bot-authored.
    const files = readdirSync(join(root, ".github/workflows")).filter((f) => f.endsWith(".yml"));
    const offenders = files.filter((f) => {
      const src = read(`.github/workflows/${f}`);
      const posts = /gh (issue|pr) comment|createComment/.test(src);
      if (!posts || src.includes(AUTOMATION_MARKER)) return false;
      // A comment step whose token env is the PAT must carry the marker.
      return /gh (issue|pr) comment[\s\S]{0,400}AUTOMATION_PAT|AUTOMATION_PAT[\s\S]{0,200}gh (issue|pr) comment/.test(
        src
      );
    });
    expect(WORKFLOW_REASON).toBeTruthy();
    expect(offenders).toEqual([]);
    // Known PAT-backed comment step (GITHUB_TOKEN env = AUTOMATION_PAT).
    expect(read(".github/workflows/revert-watchdog.yml")).toContain(AUTOMATION_MARKER);
  });
});
