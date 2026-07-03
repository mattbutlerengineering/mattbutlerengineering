import fs from "node:fs";
import path from "node:path";

/**
 * Shared markdown-reference extractor for fitness-check scripts.
 *
 * Parses `[text](link)` references plus ASCII project-structure trees inside
 * unlabeled fenced code blocks, resolving each to an absolute path relative
 * to the containing file. Used by both check-doc-freshness.mjs (deep: also
 * walks tree diagrams) and detect-instruction-rot.mjs (only needs the
 * markdown-link subset) so the two scripts no longer maintain separate,
 * near-duplicate link-parsing regexes.
 */

function isPathLikeName(name) {
  if (/\.\w+$/.test(name)) return true;
  if (/^[a-zA-Z0-9_-]+$/.test(name)) return true;
  return false;
}

/**
 * Extract path-like references (markdown links + fenced tree diagrams) from
 * a markdown file's content.
 *
 * @param {string} content
 * @param {string} filePath - path to the file `content` came from, used to resolve relative links
 * @returns {Array<{ file: string, referencedPath: string, resolvedPath: string, line: number, type: "markdown-link" | "tree-entry" }>}
 */
export function extractMarkdownReferences(content, filePath) {
  const refs = [];
  const lines = content.split("\n");
  const fileDir = path.dirname(filePath);

  let inFencedBlock = false;
  let fenceLang = null;
  let treeRootDir = null;
  let treePathStack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      if (!inFencedBlock) {
        inFencedBlock = true;
        const langMatch = line.trimStart().match(/^```(\w+)/);
        fenceLang = langMatch ? langMatch[1] : null;
        treeRootDir = null;
        treePathStack = [];
      } else {
        inFencedBlock = false;
        fenceLang = null;
        treeRootDir = null;
        treePathStack = [];
      }
      continue;
    }

    if (inFencedBlock) {
      if (fenceLang) continue;

      const newRootMatch = line.match(/^(\S+?)\/\s*$/);
      if (newRootMatch) {
        const candidate = newRootMatch[1];
        const candidatePath = path.resolve(fileDir, candidate);
        if (fs.existsSync(candidatePath)) {
          treeRootDir = candidate;
        } else if (candidate.includes("/")) {
          treeRootDir = "SKIP";
        } else {
          treeRootDir = "";
        }
        treePathStack = [];
        continue;
      }

      const treeEntry = line.match(/^([│ ]*)[├└]── (.+?)\/?(\s+#.*)?$/);
      if (treeEntry) {
        const name = treeEntry[2].trim();
        if (!isPathLikeName(name)) continue;

        const indent = treeEntry[1].replace(/[│]/g, " ").length;
        const depth = Math.floor(indent / 4) + 1;

        if (treeRootDir === null) treeRootDir = "";
        if (treeRootDir === "SKIP") continue;

        while (treePathStack.length >= depth) treePathStack.pop();
        treePathStack.push(name);

        const segments = treeRootDir ? [treeRootDir, ...treePathStack] : [...treePathStack];
        const refPath = segments.join("/");
        const resolved = path.resolve(fileDir, refPath);
        refs.push({
          file: filePath,
          referencedPath: refPath,
          resolvedPath: resolved,
          line: i + 1,
          type: "tree-entry",
        });
      }
      continue;
    }

    const linkPattern = /\[.*?\]\(([^)]+)\)/g;
    let match;

    while ((match = linkPattern.exec(line)) !== null) {
      const link = match[1].split("#")[0].trim();
      if (!link) continue;
      if (link.startsWith("http") || link.startsWith("mailto:")) continue;

      const resolved = path.resolve(fileDir, link);
      refs.push({
        file: filePath,
        referencedPath: path.relative(path.dirname(filePath), resolved),
        resolvedPath: resolved,
        line: i + 1,
        type: "markdown-link",
      });
    }
  }

  return refs;
}

/**
 * Extract references and return only the ones whose resolved target is missing.
 *
 * @param {string} content
 * @param {string} filePath
 * @param {(resolvedPath: string) => boolean} [fileExists] - defaults to fs.existsSync
 * @returns {ReturnType<typeof extractMarkdownReferences>}
 */
export function checkStaleReferences(content, filePath, fileExists = fs.existsSync) {
  return extractMarkdownReferences(content, filePath).filter(
    (ref) => !fileExists(ref.resolvedPath)
  );
}
