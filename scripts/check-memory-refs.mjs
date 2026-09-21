#!/usr/bin/env node

/**
 * Validates that every `feeds_back_into:` reference in the session-learning
 * corpus still resolves (#4876).
 *
 * `.claude/memory/corrections/**` and `docs/reflections/**` each carry a
 * `feeds_back_into:` field naming where that lesson was promoted — the
 * gotchas section, the CLAUDE.md heading, the script it changed. That field
 * is the promotion trail: it is how a later reader answers "did this lesson
 * actually land anywhere, and where". A reference that no longer resolves
 * answers that question WRONGLY rather than not at all, which is worse,
 * because it reads as a completed promotion.
 *
 * The 2026-09 monthly reflection review found five such references by hand,
 * a month or more after they broke:
 *
 *   - `CLAUDE.md#bash-tool-quirks` — that heading only ever existed in the
 *     user's global `~/.claude/CLAUDE.md`, never in this repo's CLAUDE.md
 *   - `scripts/acmm/outputs/report.js` and `.claude/skills/acmm-audit/SKILL.md`
 *     (cited by all three `docs/reflections/2026-04-25-*.md`) — both moved
 *     under `plugins/acmm/**` when the ACMM skill was extracted to a plugin
 *     (#818), and nothing updated the references
 *
 * Nothing went red for either, because nothing was asking.
 *
 * ## What this does NOT verify
 *
 * Only that the path exists and the anchor resolves — NOT that the section
 * named actually discusses the lesson. That distinction is load-bearing: the
 * same review found `.claude/rules/gotchas.md#pre-commit--lint` cited for the
 * zsh `$status` trap, which resolved perfectly while that section contained
 * zero mentions of zsh (the trap lives under `## Shell (zsh)`). A mechanical
 * check cannot catch that and must not imply it did. Semantic correctness
 * stays a human judgement in the monthly review.
 *
 * ## Fail-closed
 *
 * A file that cannot be read is a finding, not a skip — an unreadable file is
 * not a verified file, and silently skipping it is how a gate becomes
 * decorative.
 *
 * ## README files are excluded
 *
 * `docs/reflections/README.md` and `.claude/memory/README.md` document the
 * FORMAT, so their `feeds_back_into:` lines are illustrative templates
 * (`path/to/instruction-file.md`, a literal `...`). Those are not promotion
 * claims and must never be "fixed" into real paths — a README is not a
 * memory entry. Excluding them by name keeps the check honest without an
 * allowlist that could later hide a real entry.
 *
 * Usage:
 *   node scripts/check-memory-refs.mjs
 * Exit code: 0 when every reference resolves, 1 otherwise.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories whose markdown files carry a `feeds_back_into:` field. */
export const SCANNED_DIRS = [".claude/memory", ".claude/reflections", "docs/reflections"];

/**
 * GitHub's heading-anchor form: lowercase, drop everything that is not a word
 * character, space or hyphen, then spaces to hyphens. Runs of removed
 * punctuation leave their surrounding spaces behind, which is why
 * `## Pre-commit / lint` becomes `pre-commit--lint` and not `pre-commit-lint`.
 *
 * @param {string} line - a heading line, with or without its leading `#`s
 * @returns {string}
 */
export function slugifyHeading(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .trim()
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");
}

/**
 * Every anchor a markdown document exposes.
 *
 * Skips fenced code blocks: a `# comment` inside a shell fence is not a
 * heading, and counting it would invent anchors GitHub will not honour —
 * making a genuinely dangling reference look fine.
 *
 * @param {string} markdown
 * @returns {Set<string>}
 */
export function extractHeadingAnchors(markdown) {
  const anchors = new Set();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s+\S/.test(line)) anchors.add(slugifyHeading(line));
  }
  return anchors;
}

/**
 * The references declared by one file's `feeds_back_into:` field.
 *
 * Handles both shapes in use: the comma-separated form in `.claude/memory`
 * (`feeds_back_into: a#b, c#d`) and the YAML-array form in
 * `docs/reflections` (`feeds_back_into: [a, b]`). An absent field yields `[]`
 * — reinforcements use `action`/`context`/`pattern` and have no such field by
 * design (see `.claude/memory/README.md`), so absence is not a finding.
 *
 * @param {string} text - the file's contents (or just its frontmatter)
 * @returns {string[]}
 */
export function parseFeedsBackInto(text) {
  const match = /^feeds_back_into:[ \t]*(.*)$/m.exec(text);
  if (!match) return [];
  return match[1]
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((ref) => ref.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/**
 * Whether one reference resolves.
 *
 * A missing file short-circuits: its anchor is reported verbatim but is NOT
 * judged, because there is no document to judge it against. Claiming
 * `anchor-missing` there would misattribute the cause.
 *
 * @param {string} ref - e.g. `CLAUDE.md#manual-deployment`
 * @param {{ exists: (p: string) => boolean, anchorsFor: (p: string) => Set<string> }} resolvers
 * @returns {{ ref: string, path: string, anchor: string|null, state: "ok"|"file-missing"|"anchor-missing" }}
 */
export function classifyRef(ref, { exists, anchorsFor }) {
  const hashAt = ref.indexOf("#");
  const path = (hashAt === -1 ? ref : ref.slice(0, hashAt)).trim();
  const anchor = hashAt === -1 ? null : ref.slice(hashAt + 1).trim() || null;

  if (!exists(path)) return { ref, path, anchor, state: "file-missing" };
  if (anchor && !anchorsFor(path).has(anchor)) {
    return { ref, path, anchor, state: "anchor-missing" };
  }
  return { ref, path, anchor, state: "ok" };
}

/**
 * Every non-resolving reference across `files`, tagged with its source.
 *
 * @param {string[]} files
 * @param {{
 *   exists: (p: string) => boolean,
 *   anchorsFor: (p: string) => Set<string>,
 *   readFile: (p: string) => string,
 * }} resolvers
 * @returns {Array<{ source: string, ref: string, path: string, anchor: string|null, state: string }>}
 */
export function collectRefFindings(files, resolvers) {
  const findings = [];
  for (const source of files) {
    let text;
    try {
      text = resolvers.readFile(source);
    } catch (error) {
      findings.push({
        source,
        ref: "(file could not be read)",
        path: source,
        anchor: null,
        state: "unreadable",
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const ref of parseFeedsBackInto(text)) {
      const result = classifyRef(ref, resolvers);
      if (result.state !== "ok") findings.push({ source, ...result });
    }
  }
  return findings;
}

/**
 * Markdown files under `dirs`, recursively, relative to `root`.
 *
 * @param {string[]} dirs
 * @param {string} [root]
 * @returns {string[]}
 */
export function listCorpusFiles(dirs = SCANNED_DIRS, root = ROOT) {
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs)) {
      const child = join(abs, entry);
      if (statSync(child).isDirectory()) walk(child);
      // README.md documents the format; its feeds_back_into is a template,
      // not a promotion claim. See the module header.
      else if (entry.endsWith(".md") && entry !== "README.md") {
        out.push(relative(root, child));
      }
    }
  };
  for (const dir of dirs) {
    const abs = join(root, dir);
    if (existsSync(abs)) walk(abs);
  }
  return out.sort();
}

/**
 * @param {{ source: string, ref: string, state: string, error?: string }} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  const why =
    finding.state === "unreadable"
      ? `unreadable (${finding.error})`
      : finding.state === "file-missing"
        ? "path does not exist"
        : "anchor not found in that file";
  return `${finding.source}: ${finding.ref} — ${why}`;
}

/* ── CLI ─────────────────────────────────────────────────── */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const anchorCache = new Map();
  const findings = collectRefFindings(listCorpusFiles(), {
    readFile: (p) => readFileSync(join(ROOT, p), "utf8"),
    exists: (p) => existsSync(join(ROOT, p)),
    anchorsFor: (p) => {
      if (!anchorCache.has(p)) {
        anchorCache.set(p, extractHeadingAnchors(readFileSync(join(ROOT, p), "utf8")));
      }
      return anchorCache.get(p);
    },
  });

  process.exit(
    runCheck({
      name: "memory/reflection feeds_back_into references",
      findings,
      formatFinding,
      failMessage: `FAIL: memory/reflection feeds_back_into references — ${findings.length} that do not resolve:`,
    })
  );
}
