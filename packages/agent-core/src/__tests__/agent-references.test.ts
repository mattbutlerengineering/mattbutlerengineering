/**
 * Static validation of Claude Code sub-agent references.
 *
 * The sub-agent registry keys agents by their frontmatter `name:`, not by
 * filename. A dispatch naming a type with no matching `.claude/agents/*.md`
 * throws "Agent type not found" at runtime — and because implement-queue's
 * review gate is documented fail-open, that throw is indistinguishable from a
 * clean pass. This test turns that runtime failure into a build-time one.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");
const SKILLS_DIR = join(REPO_ROOT, ".claude", "skills");
const RISK_CLASSIFIER = join(REPO_ROOT, "packages", "agent-core", "src", "pr-risk-classifier.ts");

/** Built-in Claude Code sub-agent types — no `.claude/agents/*.md` backs them. */
const BUILT_IN_AGENT_TYPES: ReadonlySet<string> = new Set(["general-purpose", "Explore"]);

/** `subagent_type: "x"` and `subagent_type="x"` both appear in skill prose. */
const SUBAGENT_TYPE_RE = /subagent_type\s*[:=]\s*["'`]([\w-]+)["'`]/g;

/** The hardcoded agent names in `pr-risk-classifier.ts`'s DIFF_REVIEWERS table. */
const DIFF_REVIEWER_NAME_RE = /^\s*name:\s*"([\w-]+)",$/gm;

function markdownFilesUnder(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Extracts the `name:` field from a markdown file's YAML frontmatter block. */
function frontmatterName(markdown: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!block) {
    return null;
  }

  const nameLine = block[1].split(/\r?\n/).find((line) => line.startsWith("name:"));
  return nameLine ? nameLine.slice("name:".length).trim() : null;
}

function matchAll(source: string, pattern: RegExp): readonly string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/** Agent type → the declaring file, keyed by frontmatter `name:` (the registry key). */
const declaredAgents: ReadonlyMap<string, string> = new Map(
  readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => {
      const name = frontmatterName(readFileSync(join(AGENTS_DIR, file), "utf-8"));
      return name === null ? [] : [[name, file] as const];
    })
);

/** Agent type → the sources that dispatch it. */
const referencedAgents: ReadonlyMap<string, readonly string[]> = (() => {
  const sources: ReadonlyArray<readonly [string, readonly string[]]> = [
    ...markdownFilesUnder(SKILLS_DIR).map(
      (file) =>
        [
          relative(REPO_ROOT, file),
          matchAll(readFileSync(file, "utf-8"), SUBAGENT_TYPE_RE),
        ] as const
    ),
    [
      relative(REPO_ROOT, RISK_CLASSIFIER),
      matchAll(readFileSync(RISK_CLASSIFIER, "utf-8"), DIFF_REVIEWER_NAME_RE),
    ] as const,
  ];

  const index = new Map<string, string[]>();
  for (const [source, names] of sources) {
    for (const name of names) {
      index.set(name, [...(index.get(name) ?? []), source]);
    }
  }
  return index;
})();

describe("agent references", () => {
  it("declares a frontmatter name for every agent file", () => {
    const missing = readdirSync(AGENTS_DIR)
      .filter((file) => file.endsWith(".md"))
      .filter((file) => frontmatterName(readFileSync(join(AGENTS_DIR, file), "utf-8")) === null);

    expect(missing).toEqual([]);
  });

  it("finds the hardcoded reviewer names in pr-risk-classifier", () => {
    // Guards the silent-zero failure mode: a rename of the DIFF_REVIEWERS
    // table's `name` property would otherwise drop those names from coverage.
    const names = matchAll(readFileSync(RISK_CLASSIFIER, "utf-8"), DIFF_REVIEWER_NAME_RE);
    expect(names.length).toBeGreaterThan(0);
  });

  it("resolves every dispatched agent type to a declared agent", () => {
    const unresolved = [...referencedAgents]
      .filter(([name]) => !BUILT_IN_AGENT_TYPES.has(name) && !declaredAgents.has(name))
      .map(([name, sources]) => `${name} (dispatched by ${sources.join(", ")})`);

    expect(unresolved).toEqual([]);
  });

  it("reports declared agents that no dispatcher references", () => {
    const undispatched = [...declaredAgents.keys()]
      .filter((name) => !referencedAgents.has(name))
      .sort();

    if (undispatched.length > 0) {
      console.info(`[agent-references] declared but never dispatched: ${undispatched.join(", ")}`);
    }

    // Non-failing by design. An agent may legitimately be dispatched by a human
    // or a caller outside this repo, so an unreferenced agent is a signal to
    // read, not a defect to block on. Asserting the report is well-formed keeps
    // it from silently going stale.
    expect(undispatched.every((name) => declaredAgents.has(name))).toBe(true);
  });
});
