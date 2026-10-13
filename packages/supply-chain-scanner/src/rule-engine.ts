import type { Category, Finding, Severity } from "./types.js";

export interface Rule {
  /** Non-global regex tested per line / folded continuation. (Global regexes carry lastIndex state — banned.) */
  readonly pattern: RegExp;
  readonly category: Category;
  readonly severity: Severity;
  /** Optional file-path filter; the rule is skipped for files that match. */
  readonly excludes?: RegExp;
  /** Optional language filter; the rule is skipped for files detected as one of these. */
  readonly excludeLanguages?: readonly Language[];
}

export type Language = "python" | "other";

const PYTHON_SHEBANG = /^#!\s*\S*\/(?:env\s+(?:-\S+\s+)*)?python[\d.]*(?:\s|$)/;

/** Language from the extension, or from the shebang interpreter for extension-less files. */
export function detectLanguage(file: string, content: string): Language {
  const base = file.slice(file.lastIndexOf("/") + 1);
  if (base.includes(".")) return /\.py$/i.test(base) ? "python" : "other";
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return PYTHON_SHEBANG.test(firstLine) ? "python" : "other";
}

const MAX_EVIDENCE = 120;

/** Max physical lines folded into one continuation group (bounds work, limits cross-line noise). */
const MAX_JOINED_LINES = 4;

/** A line that cannot be complete alone: trailing backslash continuation, or an open `(` / `|`. */
const CONTINUES = /(\\|\(|\|)\s*$/;

/** Prose only folds backslash continuations — markdown table rows end in `|`. */
const PROSE_CONTINUES = /\\\s*$/;

interface Group {
  readonly text: string;
  /** Physical lines in the group after the first. */
  readonly rest: readonly string[];
}

/** Fold the continuation group starting at `start`, or null when the line does not continue. */
function continuationGroup(
  lines: readonly string[],
  start: number,
  continues: RegExp
): Group | null {
  let text = lines[start]!;
  const rest: string[] = [];
  while (
    continues.test(text) &&
    rest.length + 1 < MAX_JOINED_LINES &&
    start + rest.length + 1 < lines.length
  ) {
    const next = lines[start + rest.length + 1]!;
    rest.push(next);
    text = `${text.replace(/\\\s*$/, "")} ${next.trim()}`;
  }
  return rest.length > 0 ? { text, rest } : null;
}

/**
 * Apply regex rules to a file's text. Every physical line is tested first and
 * reports at its own line. Only when a rule matched no physical line of a
 * continuation group (`curl x \` + `| sh`, `require(` + `name)`) is the folded
 * group tested, reporting at the group's first line. Prose files fold
 * backslash continuations only (markdown table rows end in `|`). Pure: returns a new array.
 */
export function applyRules(file: string, content: string, rules: readonly Rule[]): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);
  const prose = isProseFile(file);
  const continues = prose ? PROSE_CONTINUES : CONTINUES;
  const language = detectLanguage(file, content);
  const active = rules.filter(
    (r) => (!r.excludes || !r.excludes.test(file)) && !r.excludeLanguages?.includes(language)
  );
  const add = (rule: Rule, line: number, text: string): void => {
    findings.push({
      category: rule.category,
      severity: rule.severity,
      file,
      line,
      evidence: text.trim().slice(0, MAX_EVIDENCE),
    });
  };
  for (const [i, line] of lines.entries()) {
    const group = continuationGroup(lines, i, continues);
    for (const rule of active) {
      if (rule.pattern.test(line)) {
        add(rule, i + 1, line);
      } else if (group && rule.pattern.test(group.text)) {
        if (!group.rest.some((l) => rule.pattern.test(l))) add(rule, i + 1, group.text);
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
