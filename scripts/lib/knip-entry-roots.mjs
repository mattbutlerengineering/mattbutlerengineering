// Derives the real entry points of the `scripts` knip workspace (#7488).
//
// A script under scripts/ is a root when something outside the module graph runs
// it by path: a package.json script, a workflow `run:` line, a husky hook, a
// Claude hook, or a skill/routine/agent doc. Knip cannot see those callers, so
// they are listed in knip.jsonc; scripts/__tests__/knip-entry-roots.test.mjs
// keeps that list equal to what this module finds.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_REF = /(?<![\w./-])scripts\/([\w./-]+?\.(?:mjs|cjs|js|mts|ts))(?![\w-])/g;

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
  "docs/routines",
  // On-demand benchmark CLIs documented as runnable commands.
  "docs/acmm",
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
export function findReferencedScripts(repoRoot) {
  const found = new Set();
  for (const source of REFERENCE_SOURCES) {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  console.log(JSON.stringify(findReferencedScripts(repoRoot), null, 2));
}
