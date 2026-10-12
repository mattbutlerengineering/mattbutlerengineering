import type { Category, Finding, Severity } from "./types.js";

export interface Rule {
  /** Non-global regex tested per logical line. (Global regexes carry lastIndex state — banned.) */
  readonly pattern: RegExp;
  readonly category: Category;
  readonly severity: Severity;
}

const MAX_EVIDENCE = 120;

/** Max physical lines folded into one logical line (bounds work, limits cross-line noise). */
const MAX_JOINED_LINES = 4;

/** A line that cannot be complete alone: trailing backslash continuation, or an open `(` / `|`. */
const CONTINUES = /(\\|\(|\|)\s*$/;

interface LogicalLine {
  readonly line: number;
  readonly text: string;
}

/**
 * Fold continuation lines (`curl x \` + `| sh`, `require(` + `name)`) into one
 * logical line, reported at its first physical line.
 */
function toLogicalLines(content: string): LogicalLine[] {
  const lines = content.split(/\r?\n/);
  const out: LogicalLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    let text = lines[i]!;
    let taken = 1;
    while (CONTINUES.test(text) && taken < MAX_JOINED_LINES && i + taken < lines.length) {
      text = `${text.replace(/\\\s*$/, "")} ${lines[i + taken]!.trim()}`;
      taken++;
    }
    out.push({ line: i + 1, text });
    i += taken - 1;
  }
  return out;
}

/**
 * Apply regex rules to a file's text, one logical line at a time (continuations
 * folded). Pure: returns a new array. Each matching line yields one Finding per
 * matching rule.
 */
export function applyRules(file: string, content: string, rules: readonly Rule[]): Finding[] {
  const findings: Finding[] = [];
  for (const { line: lineNo, text: line } of toLogicalLines(content)) {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push({
          category: rule.category,
          severity: rule.severity,
          file,
          line: lineNo,
          evidence: line.trim().slice(0, MAX_EVIDENCE),
        });
      }
    }
  }
  return findings;
}

const PROSE_EXTENSIONS = [".md", ".mdx", ".txt"];

export function isProseFile(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  return PROSE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
