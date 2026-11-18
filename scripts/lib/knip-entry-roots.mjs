// Derives the real entry points of the `scripts` knip workspace (#7488).
//
// A script under scripts/ is a root when something outside the module graph runs
// it by path: a package.json script, a workflow `run:` line, a husky hook, a
// Claude hook, or a skill/routine/agent doc. Knip cannot see those callers, so
// they are listed in knip.jsonc; scripts/__tests__/knip-entry-roots.test.mjs
// keeps that list equal to what findRootsKnipCannotSee finds. Callers knip's
// plugins already follow (package.json, workflows, husky) are deliberately NOT
// listed: knip reports each as a redundant entry pattern.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// A bare `scripts/x` or one rooted at $CLAUDE_PROJECT_DIR (hooks and settings
// write `"$CLAUDE_PROJECT_DIR/scripts/x"`; the lookbehind used to reject it).
const SCRIPT_REF =
  /(?:(?<![\w./-])|(?<=\$CLAUDE_PROJECT_DIR\/)|(?<=\$\{CLAUDE_PROJECT_DIR\}\/))scripts\/([\w./-]+?\.(?:mjs|cjs|js|mts|ts))(?![\w-])/g;

/** Repo-relative locations whose text is scanned for `scripts/<file>` references. */
const REFERENCE_SOURCES = [
  "package.json",
  ".github/workflows",
  ".github/actions",
  ".husky",
  ".claude/settings.json",
  ".claude/hooks",
  ".claude/agents",
  ".claude/skills",
  ".claude/implement-queue.md",
  "docs/routines",
  // On-demand benchmark CLIs documented as runnable commands.
  "docs/acmm",
];

/** The subset of REFERENCE_SOURCES whose callers knip's own plugins already follow. */
const KNIP_VISIBLE_SOURCES = ["package.json", ".github/workflows", ".github/actions", ".husky"];

/**
 * Scripts a workflow names only by path filter, comment or `git show`, never as a
 * command knip would follow. They are workflow-referenced yet invisible to knip,
 * so they stay listed in knip.jsonc.
 */
const PATH_ONLY_WORKFLOW_REFERENCES = [
  "lib/nightly-compliance-signature.mjs",
  "main-strictness.mjs",
  "tier-escalation.mjs",
  "ui-quality/ledger.mjs",
  "ui-quality/routes.mjs",
  "visual-diff-comment.mjs",
];

const SCANNED_EXTENSIONS = /\.(json|ya?ml|md|sh|mjs|js)$/;

function listFiles(abs) {
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "_") return [];
    const child = join(abs, entry.name);
    return entry.isDirectory() ? listFiles(child) : [child];
  });
}

function isScannable(abs) {
  // Husky hooks have no extension; skill docs are markdown. Skip skill-local
  // code: a skill's own scripts/ folder is a different `scripts/` tree.
  return abs.includes("/.husky/") || SCANNED_EXTENSIONS.test(abs);
}

/**
 * @param {string} repoRoot absolute repo root
 * @returns {string[]} sorted script paths relative to scripts/ (no __tests__)
 */
export function findReferencedScripts(repoRoot, sources = REFERENCE_SOURCES) {
  const found = new Set();
  for (const source of sources) {
    for (const file of listFiles(join(repoRoot, source))) {
      if (!isScannable(file)) continue;
      for (const match of readFileSync(file, "utf-8").matchAll(SCRIPT_REF)) {
        const rel = match[1];
        if (rel.startsWith("__tests__/")) continue;
        if (existsSync(join(repoRoot, "scripts", rel))) found.add(rel);
      }
    }
  }
  return [...found].sort();
}

/**
 * Roots knip cannot discover itself: referenced from Claude settings, hooks,
 * agents, skills or routine docs but not from package.json, workflows or husky.
 * Listing anything else in knip.jsonc is a "redundant pattern" hint (#9079).
 *
 * @param {string} repoRoot absolute repo root
 * @returns {string[]} sorted script paths relative to scripts/
 */
export function findRootsKnipCannotSee(repoRoot) {
  const visible = new Set(findReferencedScripts(repoRoot, KNIP_VISIBLE_SOURCES));
  const blind = new Set(PATH_ONLY_WORKFLOW_REFERENCES);
  return findReferencedScripts(repoRoot).filter((file) => !visible.has(file) || blind.has(file));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  console.log(JSON.stringify(findRootsKnipCannotSee(repoRoot), null, 2));
}
