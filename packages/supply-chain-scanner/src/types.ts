/**
 * Static supply-chain scanner types.
 *
 * The scanner inspects a third-party skill / MCP package BEFORE it is installed.
 * It is a pure static analyzer: it only ever reads the package's files as text.
 * It NEVER imports, requires, evaluates, or otherwise executes the scanned code.
 */

export type Category = "prompt-injection" | "data-exfiltration" | "malicious-command";

export type Severity = "low" | "med" | "high";

export type Verdict = "pass" | "flag" | "block";

export interface Finding {
  readonly category: Category;
  readonly severity: Severity;
  /** Path of the offending file, relative to the scanned package root. */
  readonly file: string;
  /** 1-indexed line number of the match. */
  readonly line: number;
  /** Short snippet of the matched text (truncated, never the whole file). */
  readonly evidence: string;
}

export interface ScanResult {
  readonly verdict: Verdict;
  readonly findings: readonly Finding[];
}

/** A package file read as text, ready for static inspection. */
export interface SourceFile {
  /** Path relative to the scanned package root (POSIX separators). */
  readonly relPath: string;
  readonly content: string;
}
