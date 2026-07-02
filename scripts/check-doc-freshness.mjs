import fs from "node:fs";
import path from "node:path";
import { walkFiles } from "./lib/repo-scan.mjs";
import { extractMarkdownReferences } from "./lib/markdown-refs.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const DOC_FILES = new Set(["README.md", "CLAUDE.md"]);

export function findDocFiles(root) {
  return walkFiles(root, { match: (name) => DOC_FILES.has(name) });
}

// Re-exported for backward compatibility — the extractor now lives in the
// shared scripts/lib/markdown-refs.mjs module (also used by
// detect-instruction-rot.mjs) so the two scripts share one implementation.
export { extractMarkdownReferences as extractPathReferences };

export function checkFreshness(root) {
  const docFiles = findDocFiles(root);
  const stale = [];

  for (const docFile of docFiles) {
    const content = fs.readFileSync(docFile, "utf-8");
    const refs = extractMarkdownReferences(content, docFile);

    for (const ref of refs) {
      if (!fs.existsSync(ref.resolvedPath)) {
        stale.push(ref);
      }
    }
  }

  return { stale };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const root = process.argv[2] || process.cwd();
  console.log("Checking doc freshness...");
  const { stale } = checkFreshness(root);

  for (const ref of stale) {
    console.error(
      `[STALE] ${path.relative(root, ref.file)}:${ref.line}: ${ref.referencedPath} does not exist`
    );
  }

  const exitCode = runCheck({
    name: "doc freshness",
    findings: stale,
    passMessage: "No stale references found.",
    failMessage: `Found ${stale.length} stale reference(s).`,
  });
  process.exit(exitCode);
}
