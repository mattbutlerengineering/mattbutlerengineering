#!/usr/bin/env node
/**
 * Mechanical markdown audit — the deterministic half of the weekly docs audit.
 *
 * Checks every git-tracked `.md` file for two classes of rot a script can
 * settle without judgement:
 *
 *  1. **Broken relative links** — a `[text](path)` whose target does not exist.
 *     The common sub-case is a repo-root path written as if it were
 *     document-relative (`[x](./docs/a.md)` from inside `.github/`), which
 *     renders as a dead link on GitHub while looking correct in a diff. That
 *     case is auto-fixable and `--fix` rewrites it.
 *  2. **Stale directory trees** — an ASCII tree in a fenced block listing paths
 *     that no longer exist. Reported, never auto-fixed: deciding what the tree
 *     *should* say is a judgement call.
 *
 * Prose accuracy (a doc that describes behaviour the code no longer has) is
 * deliberately out of scope — that is the `/md-audit` agent pass.
 *
 * Why this does not reuse `scripts/lib/markdown-refs.mjs`: that module resolves
 * tree entries relative to the *containing document*, which is right for the
 * root-level README.md/CLAUDE.md it was written for and wrong for a repo-root
 * tree drawn inside `docs/` (every entry resolves to `docs/apps/...` and reports
 * dangling, including the entries that are correct). This module resolves tree
 * entries against the repo root, and injects `exists` so the checks stay pure.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Links that are known-dangling on purpose. Each needs a reason: an
 * unexplained suppression is indistinguishable from an unnoticed break.
 */
export const KNOWN_EXCEPTIONS = [
  {
    file: "SECURITY.md",
    target: "docs/security-acknowledgements.md",
    reason:
      "Forward reference. The surrounding prose states the file is created on the first acknowledged report; the link is the promise, not a claim it exists.",
  },
];

const DATE_PREFIXED = /^\d{4}-\d{2}-\d{2}-/;
const FILESYSTEM_SEGMENT = /^[a-z0-9._-]+$/;
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

/**
 * Blank out inline code spans, preserving length so line and column numbers
 * survive. A link inside backticks is a worked example (`- [Title](file.md)` in
 * a skill's template), not a reference the repo has to satisfy.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripInlineCode(text) {
  // `[^`\n]+` (not `*`) is load-bearing: an empty-content match would consume a
  // bare ``` fence delimiter and blank it, which would hide every fenced block
  // from the checks below.
  return text.replace(/`+[^`\n]+`+/g, (span) => " ".repeat(span.length));
}

/**
 * A dated snapshot describes the tree as it was proposed on that date. Its
 * references are expected to drift and fixing them would falsify the record.
 *
 * @param {string} filePath - repo-relative posix path
 * @returns {boolean}
 */
export function isArchivalDoc(filePath) {
  return DATE_PREFIXED.test(path.posix.basename(filePath));
}

/**
 * Distinguish a directory tree from a decision tree drawn with the same
 * box-drawing characters (`├── No`, `├── Text`). Filesystem names in this repo
 * are lowercase or carry an extension; decision-tree labels are prose.
 *
 * @param {string} referencedPath
 * @returns {boolean}
 */
export function isDirectoryTreeEntry(referencedPath) {
  if (HAS_EXTENSION.test(referencedPath)) return true;
  return referencedPath.split("/").every((segment) => FILESYSTEM_SEGMENT.test(segment));
}

/**
 * @param {string} filePath
 * @param {string} target - repo-relative posix path
 * @returns {boolean}
 */
export function isKnownException(filePath, target) {
  return KNOWN_EXCEPTIONS.some((e) => e.file === filePath && e.target === target);
}

function normalizeRootPath(p) {
  return path.posix.normalize(p).replace(/^\.\//, "").replace(/\/$/, "");
}

function resolveFromDoc(filePath, link) {
  return normalizeRootPath(path.posix.join(path.posix.dirname(filePath), link));
}

function suggestRelative(filePath, rootTarget) {
  const rel = path.posix.relative(path.posix.dirname(filePath), rootTarget);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

const LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;

function auditLinks(lines, filePath, exists) {
  const findings = [];
  let inFence = false;

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    for (const match of line.matchAll(LINK_PATTERN)) {
      const raw = match[1].split("#")[0].trim();
      if (!raw) continue;
      if (/^(https?:|mailto:|#)/.test(raw)) continue;

      const fromDoc = resolveFromDoc(filePath, raw);
      if (exists(fromDoc)) continue;

      const fromRoot = normalizeRootPath(raw);
      if (isKnownException(filePath, fromRoot) || isKnownException(filePath, fromDoc)) continue;

      if (exists(fromRoot)) {
        findings.push({
          file: filePath,
          line: index + 1,
          kind: "wrong-relative-link",
          target: fromRoot,
          message: `link "${raw}" is repo-root-relative but rendered document-relative (resolves to ${fromDoc})`,
          fix: { from: match[1], to: suggestRelative(filePath, fromRoot) },
        });
      } else {
        findings.push({
          file: filePath,
          line: index + 1,
          kind: "broken-link",
          target: fromDoc,
          message: `link "${raw}" points at nothing (checked ${fromDoc} and ${fromRoot})`,
        });
      }
    }
  });

  return findings;
}

const TREE_ROOT = /^(\S+)\/\s*$/;
const TREE_ENTRY = /^([│ ]*)[├└]── (.+?)\/?(\s+#.*)?$/;
const PLACEHOLDER = /[<>{}]|\.\.\.|…/;
const GLOB_CHARS = /[*?]/;

/**
 * Every ancestor directory of a doc, nearest first, ending at the repo root.
 *
 * @param {string} filePath
 * @returns {string[]}
 */
export function ancestorBases(filePath) {
  const bases = [];
  let dir = path.posix.dirname(filePath);
  while (dir && dir !== ".") {
    bases.push(dir);
    dir = path.posix.dirname(dir);
  }
  bases.push("");
  return bases;
}

/**
 * A tree's root line does not say which base its entries hang off. Four shapes
 * are all in use here: a repo-name label (`mattbutlerengineering/`), a
 * doc-relative dir (`src/` in packages/api-client/CLAUDE.md), a package-relative
 * dir (`src/components/Button/` in packages/rialto/docs/), and a repo-root path
 * drawn from a nested doc (`apps/hospitality/e2e/`). Rather than guess, resolve
 * against every ancestor of the doc with and without the root — an entry is
 * stale only when it exists under none, which fails toward silence.
 *
 * @param {string} filePath
 * @param {string} treeRoot - the root line's path, or "" if the block had none
 * @param {string} entryPath - the accumulated path of this entry
 * @returns {string[]}
 */
export function treeEntryCandidates(filePath, treeRoot, entryPath) {
  const withRoot = treeRoot ? path.posix.join(treeRoot, entryPath) : entryPath;
  const candidates = [];
  for (const base of ancestorBases(filePath)) {
    for (const suffix of new Set([withRoot, entryPath])) {
      candidates.push(base ? normalizeRootPath(path.posix.join(base, suffix)) : suffix);
    }
  }
  return [...new Set(candidates)];
}

function auditTrees(lines, filePath, exists) {
  const findings = [];
  let inFence = false;
  let fenceLang = null;
  let stack = [];
  let treeRoot = "";
  let skipBlock = false;
  let block = { resolved: 0, misses: [] };

  const flushBlock = () => {
    // A block where nothing at all resolves is illustrative — a scaffold
    // template or a proposed layout. Real drift looks like most entries
    // resolving and a few not, so only report misses that sit beside hits.
    if (block.resolved > 0) findings.push(...block.misses);
    block = { resolved: 0, misses: [] };
  };

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      if (inFence) flushBlock();
      inFence = !inFence;
      fenceLang = inFence ? line.trimStart().slice(3).trim() || null : null;
      stack = [];
      treeRoot = "";
      skipBlock = false;
      return;
    }
    if (!inFence || fenceLang || skipBlock) return;

    const rootMatch = line.match(TREE_ROOT);
    if (rootMatch) {
      if (PLACEHOLDER.test(rootMatch[1])) {
        skipBlock = true;
        return;
      }
      treeRoot = normalizeRootPath(rootMatch[1]);
      stack = [];
      return;
    }

    const entry = line.match(TREE_ENTRY);
    if (!entry) return;

    const name = entry[2].trim();
    if (GLOB_CHARS.test(name) || PLACEHOLDER.test(name)) return;

    const depth = Math.floor(entry[1].replace(/│/g, " ").length / 4) + 1;
    while (stack.length >= depth) stack.pop();
    stack.push(name);

    const entryPath = stack.join("/");
    if (!isDirectoryTreeEntry(entryPath)) return;

    const candidates = treeEntryCandidates(filePath, treeRoot, entryPath);
    if (candidates.some(exists)) {
      block.resolved += 1;
      return;
    }
    if (isKnownException(filePath, entryPath)) return;

    block.misses.push({
      file: filePath,
      line: index + 1,
      kind: "stale-tree-entry",
      target: entryPath,
      message: `directory tree lists "${entryPath}", which exists under none of: ${candidates.join(
        ", "
      )}`,
    });
  });

  flushBlock();
  return findings;
}

/**
 * @param {string} content
 * @param {string} filePath - repo-relative posix path
 * @param {{ exists: (repoRelativePath: string) => boolean }} deps
 * @returns {Array<{file: string, line: number, kind: string, target: string, message: string, fix?: {from: string, to: string}}>}
 */
export function auditContent(content, filePath, { exists }) {
  if (isArchivalDoc(filePath)) return [];
  const lines = stripInlineCode(content).split("\n");
  return [...auditLinks(lines, filePath, exists), ...auditTrees(lines, filePath, exists)];
}

/**
 * Apply every auto-fixable finding, returning new content. Rewrites only the
 * line each finding names, so a repeated link elsewhere in the file is left
 * alone.
 *
 * @param {string} content
 * @param {Array<object>} findings
 * @returns {string}
 */
export function applyFixes(content, findings) {
  const lines = content.split("\n");
  const fixable = findings.filter((f) => f.fix);
  if (fixable.length === 0) return content;

  const next = [...lines];
  for (const finding of fixable) {
    const index = finding.line - 1;
    const line = next[index];
    if (line === undefined || !line.includes(finding.fix.from)) continue;
    next[index] = line.replace(finding.fix.from, finding.fix.to);
  }
  return next.join("\n");
}

function trackedMarkdownFiles(cwd) {
  return execFileSync("git", ["ls-files", "*.md"], { cwd, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function main(argv) {
  const shouldFix = argv.includes("--fix");
  const asJson = argv.includes("--json");
  const cwd = process.cwd();
  const exists = (p) => fs.existsSync(path.resolve(cwd, p));

  const all = [];
  let fixedCount = 0;

  for (const file of trackedMarkdownFiles(cwd)) {
    const content = fs.readFileSync(path.resolve(cwd, file), "utf8");
    const findings = auditContent(content, file, { exists });
    if (findings.length === 0) continue;

    if (shouldFix) {
      const updated = applyFixes(content, findings);
      if (updated !== content) {
        fs.writeFileSync(path.resolve(cwd, file), updated);
        fixedCount += findings.filter((f) => f.fix).length;
      }
      all.push(...findings.filter((f) => !f.fix));
    } else {
      all.push(...findings);
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ fixed: fixedCount, findings: all }, null, 2));
  } else {
    if (shouldFix) console.log(`Auto-fixed ${fixedCount} link(s).`);
    if (all.length === 0) {
      console.log("PASS: no unfixed markdown findings.");
    } else {
      console.log(`FAIL: ${all.length} markdown finding(s) needing judgement:\n`);
      for (const f of all) {
        console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.message}`);
      }
      console.log("\nEach needs a human or the /md-audit agent pass: the correct");
      console.log("target is a judgement, not a lookup.");
    }
  }

  process.exit(all.length === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
