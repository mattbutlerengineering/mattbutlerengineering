// ── Diff parser ─────────────────────────────────────────────────────
//
// Single traversal of a unified diff into a structured, immutable
// `ParsedDiff`. Extracted so downstream consumers (static analysis,
// evaluation skip policy) share one source of truth for file boundaries
// and line accounting instead of independently re-walking the diff with
// different header patterns (`diff --git` vs `+++ b/`), which can
// silently disagree for renamed or binary files.

// ── Types ───────────────────────────────────────────────────────────

export interface DiffFile {
  readonly path: string;
  readonly addedLines: readonly { line: number; content: string }[];
  readonly removedLineCount: number;
}

export interface ParsedDiff {
  readonly files: readonly DiffFile[];
  readonly totalAddedLines: number;
  readonly totalRemovedLines: number;
  /**
   * Raw count of lines starting with `+` or `-`, including unified-diff
   * metadata lines (`+++`/`---` file headers). Legacy size-heuristic
   * parity for callers gating on diff size (e.g. `evaluationSkipDecision`'s
   * small-diff threshold) — prefer `totalAddedLines`/`totalRemovedLines`
   * for a content-only accounting.
   */
  readonly totalChangedLines: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

const GIT_HEADER_PREFIX = "diff --git ";

/**
 * Extracts the post-change file path from a `diff --git a/<old> b/<new>`
 * header line. Uses a string split (not regex) to avoid ReDoS on
 * pathological paths, and to give one consistent answer for renames
 * instead of relying on a later `+++ b/` line that may not exist
 * (rename-only diffs, binary files).
 */
function parseGitHeaderPath(line: string): string | null {
  if (!line.startsWith(GIT_HEADER_PREFIX)) return null;
  const parts = line.split(" b/");
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

function parseHunkHeader(line: string): number | null {
  // False positive: `safe-regex` flags this purely because the optional `(?:,\d+)?`
  // groups nest a repetition inside a repetition (AST "star height" 2), its blunt
  // heuristic for catastrophic backtracking — but `\d+` has no ambiguity to backtrack
  // over. Verified empirically: 50k-char adversarial input (digits with no closing
  // `@@`) matches in <1ms (issue #3410 triage).
  // eslint-disable-next-line security/detect-unsafe-regex
  const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  return match ? parseInt(match[1], 10) : null;
}

interface FileAccumulator {
  path: string;
  addedLines: { line: number; content: string }[];
  removedLineCount: number;
}

// ── Core function ───────────────────────────────────────────────────

/**
 * Parses a unified diff into an immutable `ParsedDiff`: the set of
 * changed files (in traversal order) plus overall added/removed line
 * totals. Single pass, single header-parsing strategy — the primitive
 * that `analyzeDiff` and `evaluationSkipDecision` both consume.
 */
export function parseDiff(diff: string): ParsedDiff {
  if (!diff.trim()) {
    return {
      files: [],
      totalAddedLines: 0,
      totalRemovedLines: 0,
      totalChangedLines: 0,
    };
  }

  const files: DiffFile[] = [];
  let current: FileAccumulator | null = null;
  let currentLine = 0;
  let totalAddedLines = 0;
  let totalRemovedLines = 0;
  let totalChangedLines = 0;

  const flush = () => {
    if (current) {
      files.push({
        path: current.path,
        addedLines: current.addedLines,
        removedLineCount: current.removedLineCount,
      });
    }
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("+") || line.startsWith("-")) {
      totalChangedLines += 1;
    }

    const headerPath = parseGitHeaderPath(line);
    if (headerPath !== null) {
      flush();
      current = { path: headerPath, addedLines: [], removedLineCount: 0 };
      currentLine = 0;
      continue;
    }

    const hunkLine = parseHunkHeader(line);
    if (hunkLine !== null) {
      currentLine = hunkLine;
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("+")) {
      const content = line.slice(1);
      current?.addedLines.push({ line: currentLine, content });
      currentLine += 1;
      totalAddedLines += 1;
    } else if (line.startsWith("-")) {
      if (current) current.removedLineCount += 1;
      totalRemovedLines += 1;
    } else {
      currentLine += 1;
    }
  }

  flush();

  return { files, totalAddedLines, totalRemovedLines, totalChangedLines };
}
