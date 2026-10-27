#!/usr/bin/env node

/**
 * Finds packages/services/apps CLAUDE.md files that root CLAUDE.md does not
 * document, for claude-md-sync.yml's weekly drift check (#7694).
 *
 * Root CLAUDE.md carries a generic catch-all ("CLAUDE.md files in each
 * services/* or packages/* directory") that documents every current and
 * future package/service CLAUDE.md by construction. A file under those two
 * roots is covered by name alone; apps/* has no such catch-all, so those
 * still need an explicit dir-path or basename mention.
 *
 * Hermetic: reads only the repo tree (via the CLI entry point below).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CATCHALL_ROOTS = {
  packages: "packages/*",
  services: "services/*",
};

/**
 * @param {object} opts
 * @param {string} opts.rootClaudeMd - contents of the root CLAUDE.md
 * @param {string[]} opts.claudeMdPaths - repo-relative paths, e.g. "packages/foo/CLAUDE.md"
 * @returns {string[]} paths not documented by the root CLAUDE.md
 */
export function findUndocumentedClaudeFiles({ rootClaudeMd, claudeMdPaths }) {
  return claudeMdPaths.filter((relPath) => {
    const topDir = relPath.split("/")[0];
    const catchAll = CATCHALL_ROOTS[topDir];
    if (catchAll && rootClaudeMd.includes(catchAll)) return false;

    const dirPath = path.posix.dirname(relPath);
    const baseName = path.posix.basename(dirPath);
    const alreadyReferenced = rootClaudeMd.includes(dirPath) || rootClaudeMd.includes(baseName);
    return !alreadyReferenced;
  });
}

/** @returns {string[]} repo-relative CLAUDE.md paths under packages/services/apps */
function findClaudeMdPaths(root) {
  const found = [];
  for (const topDir of Object.keys(CATCHALL_ROOTS).concat("apps")) {
    const absTopDir = path.join(root, topDir);
    if (!fs.existsSync(absTopDir)) continue;
    for (const entry of fs.readdirSync(absTopDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(absTopDir, entry.name, "CLAUDE.md");
      if (fs.existsSync(candidate)) {
        found.push(path.relative(root, candidate).split(path.sep).join("/"));
      }
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rootClaudeMd = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
  const findings = findUndocumentedClaudeFiles({
    rootClaudeMd,
    claudeMdPaths: findClaudeMdPaths(ROOT),
  });
  for (const finding of findings) process.stdout.write(`${finding}\n`);
  process.exitCode = findings.length === 0 ? 0 : 1;
}
