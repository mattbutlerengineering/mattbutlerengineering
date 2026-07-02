/**
 * Synthetic bug catalog for chaos-agent testing (#2927).
 *
 * The single source of truth for "detectable but non-breaking" bugs that the
 * Chaos Agent (scripts/chaos-agent.mjs) injects into the codebase to verify
 * that site-audit / lint / Lighthouse loops actually catch regressions.
 *
 * `injectBug` is a pure content transform — callers own reading/writing the
 * target file, which keeps this module trivially unit-testable.
 */

export type BugType = "console-error" | "lighthouse-perf" | "accessibility" | "scout-todo";

export interface BugInjector {
  description: string;
  /** Pattern used to locate the injection point (or presence check). */
  pattern: RegExp;
  /** Builds the snippet to insert; receives the pattern's capture group when relevant. */
  injection?: (capture?: string) => string;
  /** For attribute-stripping bugs: replaces every pattern match with this string. */
  replacement?: string;
  /** Import statement to prepend when the target file doesn't already have it. */
  imports?: string;
}

export const BUG_CATALOG: Record<BugType, BugInjector> = {
  "console-error": {
    description: "Injects a console error into a React component",
    pattern: /export (default )?function (\w+)/,
    injection: (name) =>
      `\n  React.useEffect(() => { console.error("CHAOS-ERROR: Synthetic bug for #${name}"); }, []);\n`,
    imports: 'import React from "react";\n',
  },
  "lighthouse-perf": {
    description: "Adds a huge invisible image to trigger a performance regression",
    pattern: /<\/\w+>/, // Find a closing tag
    injection: () =>
      `\n      {/* Synthetic performance regression */} \n      <img src="https://via.placeholder.com/4000x4000.png?text=CHAOS-REGRESSION" style={{ display: 'none' }} alt="" />\n`,
  },
  accessibility: {
    description: "Removes an aria-label or alt tag from a button, link, or image",
    pattern: /(aria-label|alt)="[^"]+"/,
    replacement: "",
  },
  "scout-todo": {
    description: "Adds a FIXME comment for scout mode to find",
    pattern: /^/,
    injection: () =>
      `// FIXME: Chaos Agent synthetic issue. This should be detected by scout mode.\n`,
  },
};

export interface InjectBugResult {
  injected: boolean;
  content: string;
}

/**
 * Applies a catalog bug to `content`. Pure — never touches the filesystem.
 * Mirrors the pre-#2927 chaos-agent.mjs behavior exactly (including the
 * console-error insertion-point quirk, preserved verbatim for compatibility).
 */
export function injectBug(type: BugType, content: string): InjectBugResult {
  const bug = BUG_CATALOG[type];

  if (type === "accessibility") {
    if (!bug.pattern.test(content)) {
      return { injected: false, content };
    }
    return { injected: true, content: content.replace(bug.pattern, bug.replacement ?? "") };
  }

  if (type === "console-error") {
    const match = content.match(bug.pattern);
    if (!match) return { injected: false, content };

    let next = content;
    if (!next.includes("import React")) {
      next = (bug.imports ?? "") + next;
    }
    const insertionPoint = next.indexOf("{", match.index) + 1;
    next = next.slice(0, insertionPoint) + bug.injection!(match[2]) + next.slice(insertionPoint);
    return { injected: true, content: next };
  }

  const match = content.match(bug.pattern);
  if (!match) return { injected: false, content };

  if (type === "scout-todo") {
    return { injected: true, content: bug.injection!() + content };
  }

  return {
    injected: true,
    content: content.replace(bug.pattern, (m) => bug.injection!() + m),
  };
}
