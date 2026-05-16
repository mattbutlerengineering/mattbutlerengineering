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
  if (braceMatch) {
    const extensions = braceMatch[1].split(",");
    return extensions.some((ext) => filePath.endsWith(`.${ext}`));
  }

  const simpleMatch = glob.match(/^\*\.(\w+)$/);
  if (simpleMatch) {
    return filePath.endsWith(`.${simpleMatch[1]}`);
  }

  return true;
}

function parseHunkHeader(line: string): number | null {
  const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  return match ? parseInt(match[1], 10) : null;
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

  if (!diff.trim()) {
    return {
      clean: true,
      violations: [],
      durationMs: performance.now() - start,
    };
  }

  const violations: Violation[] = [];
  let currentFile = "";
  let currentLine = 0;

  const lines = diff.split("\n");

  for (const line of lines) {
    // Track current file from +++ headers
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      continue;
    }

    // Track line numbers from hunk headers
    const hunkLine = parseHunkHeader(line);
    if (hunkLine !== null) {
      currentLine = hunkLine;
      continue;
    }

    // Skip non-added lines and diff metadata
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ")) {
      continue;
    }

    if (line.startsWith("+")) {
      const content = line.slice(1);

      for (const rule of ANALYSIS_RULES) {
        if (!matchesFileGlob(currentFile, rule.fileGlob)) continue;
        if (rule.pattern.test(content)) {
          violations.push({
            rule: rule.id,
            file: currentFile,
            line: currentLine,
            message: rule.message,
            severity: rule.severity,
          });
        }
      }

      currentLine += 1;
    } else if (!line.startsWith("-")) {
      // Context lines (no prefix) still advance the line counter
      currentLine += 1;
    }
  }

  const durationMs = performance.now() - start;

  return {
    clean: violations.length === 0,
    violations,
    durationMs,
  };
}

// ── Formatter ───────────────────────────────────────────────────────

/**
 * Formats violations as a human-readable report.
 */
export function formatViolations(violations: readonly Violation[]): string {
  if (violations.length === 0) return "No violations found.";

  const lines = violations.map(
    (v) => `  ${v.severity === "error" ? "ERROR" : "WARN"}  ${v.file}:${v.line}  [${v.rule}] ${v.message}`
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
