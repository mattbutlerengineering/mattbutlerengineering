import type { Category, Finding, Severity } from "./types.js";

export interface Rule {
  /** Non-global regex tested per line. (Global regexes carry lastIndex state — banned.) */
  readonly pattern: RegExp;
  readonly category: Category;
  readonly severity: Severity;
}

const MAX_EVIDENCE = 120;

/**
 * Apply per-line regex rules to a file's text. Pure: returns a new array.
 * Each matching line yields one Finding per matching rule.
 */
export function applyRules(file: string, content: string, rules: readonly Rule[]): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push({
          category: rule.category,
          severity: rule.severity,
          file,
          line: i + 1,
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
