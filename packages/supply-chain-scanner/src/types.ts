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
  /**
   * For a synthetic cross-file correlation finding, the path of the OTHER file
   * involved in the pattern — i.e. the secret-read file when `file` is the
   * outbound-call file. Absent on ordinary single-file findings.
   */
  readonly correlatedWith?: string;
}

export interface ScanResult {
  readonly verdict: Verdict;
  readonly findings: readonly Finding[];
  /**
   * Synthetic `high` findings from the cross-file correlation phase: a secret
   * read in one file paired with an outbound call in another. Present only when
   * at least one cross-file exfiltration pattern was detected, so callers have
   * an inspectable record of what was correlated and why.
   */
  readonly correlatedFindings?: readonly Finding[];
}

/** A package file read as text, ready for static inspection. */
export interface SourceFile {
  /** Path relative to the scanned package root (POSIX separators). */
  readonly relPath: string;
  readonly content: string;
}
