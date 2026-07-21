import { parseDiff } from "./diff-parser.js";

// ── Types ───────────────────────────────────────────────────────────

export interface Violation {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly severity: "warning" | "error";
}

export interface StaticAnalysisResult {
  readonly clean: boolean;
  readonly violations: readonly Violation[];
  readonly durationMs: number;
}

export interface AnalysisRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly fileGlob?: string;
}

// ── Rules ───────────────────────────────────────────────────────────

export const ANALYSIS_RULES: readonly AnalysisRule[] = [
  {
    id: "no-console-log",
    pattern: /console\.log\(/,
    message: "Remove console.log() — use a proper logger instead",
    severity: "error",
    fileGlob: "*.{ts,tsx,js,jsx}",
  },
  {
    id: "no-hardcoded-hex",
    pattern: /#[0-9a-fA-F]{3,8}(?!\w)/,
    message: "Use var(--rialto-*) design tokens instead of hardcoded hex colors",
    severity: "warning",
    fileGlob: "*.{tsx,jsx}",
  },
  {
    id: "img-missing-alt",
    pattern: /<img(?![^>]*\balt=)[^>]*>/,
    message: "Add alt attribute to <img> for accessibility",
    severity: "error",
  },
  {
    id: "no-inline-style",
    pattern: /style=\{/,
    message: "Avoid inline styles — use CSS modules or design tokens",
    severity: "warning",
    fileGlob: "*.{tsx,jsx}",
  },
  {
    id: "no-todo-fixme",
    pattern: /TODO|FIXME/,
    message: "Resolve TODO/FIXME before committing or create a tracking issue",
    severity: "warning",
  },
  {
    id: "no-any-type",
    pattern: /:\s*any\b(?!\s*\*\/)/,
    message: "Avoid `any` type — use a specific type or `unknown`",
    severity: "warning",
    fileGlob: "*.{ts,tsx}",
  },
  {
    id: "no-object-mutation",
    pattern: /\b(?:Object\.assign|\.push|\.splice|\.sort|\.reverse)\s*\(/,
    message: "Prefer immutable patterns — use spread, concat, toSorted, toReversed, or toSpliced",
    severity: "warning",
    fileGlob: "*.{ts,tsx,js,jsx}",
  },
  {
    id: "no-hardcoded-url",
    pattern: /(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)|:\d{4,5}\/)/,
    message: "Use environment variables or constants instead of hardcoded URLs/ports",
    severity: "error",
    fileGlob: "*.{ts,tsx,js,jsx}",
  },
  {
    id: "no-empty-catch",
    // False positive: `safe-regex` flags this purely because the optional `(?:...)?`
    // group nests quantifiers inside another repetition (AST "star height" 2), which
    // is its blunt heuristic for catastrophic backtracking. There's no actual
    // character-class ambiguity here (`[^)]*` inside literal parens has only one way
    // to match), so there's nothing to backtrack over. Verified empirically: 50k-char
    // adversarial input matches in <1ms (issue #3410 triage).
    // eslint-disable-next-line security/detect-unsafe-regex
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    message: "Empty catch block silently swallows errors — log or rethrow",
    severity: "error",
    fileGlob: "*.{ts,tsx,js,jsx}",
  },
  {
    id: "no-non-null-assertion",
    pattern: /\w+!/,
    message: "Avoid non-null assertion (!) — use optional chaining or type narrowing",
    severity: "warning",
    fileGlob: "*.{ts,tsx}",
  },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────

function matchesFileGlob(filePath: string, glob: string | undefined): boolean {
  if (!glob) return true;

  // Extract extensions from glob like "*.{ts,tsx,js,jsx}" or "*.css"
  const braceMatch = glob.match(/^\*\.\{([^}]+)\}$/);
  if (braceMatch?.[1]) {
    const extensions = braceMatch[1].split(",");
    return extensions.some((ext) => filePath.endsWith(`.${ext}`));
  }

  const simpleMatch = glob.match(/^\*\.(\w+)$/);
  if (simpleMatch) {
    return filePath.endsWith(`.${simpleMatch[1]}`);
  }

  return true;
}

// ── Core function ───────────────────────────────────────────────────

/**
 * Performs fast static analysis on a unified diff by scanning added lines
 * for known anti-patterns. Runs in milliseconds (no AI, no network).
 *
 * Returns an immutable result with violations, clean status, and duration.
 */
export function analyzeDiff(diff: string): StaticAnalysisResult {
  const start = performance.now();

  const violations: Violation[] = [];
  const { files } = parseDiff(diff);

  for (const file of files) {
    for (const { line, content } of file.addedLines) {
      for (const rule of ANALYSIS_RULES) {
        if (!matchesFileGlob(file.path, rule.fileGlob)) continue;
        if (rule.pattern.test(content)) {
          violations.push({
            rule: rule.id,
            file: file.path,
            line,
            message: rule.message,
            severity: rule.severity,
          });
        }
      }
    }
  }

  return {
    clean: violations.length === 0,
    violations,
    durationMs: performance.now() - start,
  };
}

// ── Formatter ───────────────────────────────────────────────────────

/**
 * Formats violations as a human-readable report.
 */
export function formatViolations(violations: readonly Violation[]): string {
  if (violations.length === 0) return "No violations found.";

  const lines = violations.map(
    (v) =>
      `  ${v.severity === "error" ? "ERROR" : "WARN"}  ${v.file}:${v.line}  [${v.rule}] ${v.message}`
  );

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warnCount = violations.filter((v) => v.severity === "warning").length;

  return [
    `Static analysis: ${violations.length} violation(s) found`,
    "",
    ...lines,
    "",
    `${errorCount} error(s), ${warnCount} warning(s)`,
  ].join("\n");
}
