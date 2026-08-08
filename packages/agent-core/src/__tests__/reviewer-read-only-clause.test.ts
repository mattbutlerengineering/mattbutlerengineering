/**
 * Coverage guard: every read-only reviewer agent declared in
 * `.claude/agents/*.md` must carry an explicit no-mutation clause telling it
 * never to write to the main checkout, and pointing it at the worker's own
 * worktree (`.claude/worktrees/agent-<taskId>/`) as the sanctioned place to
 * run the PR's code when it needs to.
 *
 * The `reviewer` subagent left a worker's PR staged in the main checkout's
 * git index during a live `/implement-queue` session (#3917) — one
 * `git commit` away from being swept into an unrelated commit on an
 * unrelated branch. `REVIEWER_CONTRACT.md` already said "read-only", and the
 * agent mutated the tree anyway: the instruction lived in a doc the agent
 * doesn't receive as its prompt, not in the agent file itself. This test
 * makes the omission a build-time failure instead of a live-run near-miss.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");

/**
 * Agent types that are NOT read-only reviewers and so are exempt from the
 * no-mutation clause:
 * - `implement-queue-worker` — a worker, not a reviewer; it legitimately
 *   writes files, commits, and pushes as part of its job.
 */
const ALLOWLIST: ReadonlySet<string> = new Set(["implement-queue-worker"]);

/** Substrings that must all be present for an agent file to carry the clause. */
const REQUIRED_MARKERS: readonly string[] = [
  "Never mutate the main checkout",
  ".claude/worktrees/agent-<taskId>/",
  "git status --porcelain",
];

/** Extracts the `name:` field from a markdown file's YAML frontmatter block. */
function frontmatterName(markdown: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!block) {
    return null;
  }

  const nameLine = block[1].split(/\r?\n/).find((line) => line.startsWith("name:"));
  return nameLine ? nameLine.slice("name:".length).trim() : null;
}

function agentFiles(): ReadonlyArray<{ name: string; file: string; content: string }> {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => {
      const content = readFileSync(join(AGENTS_DIR, file), "utf-8");
      const name = frontmatterName(content);
      return name === null ? [] : [{ name, file, content }];
    });
}

describe("read-only reviewer agents forbid mutating the main checkout", () => {
  for (const { name, file, content } of agentFiles()) {
    if (ALLOWLIST.has(name)) {
      continue;
    }

    it(`${file} (${name}) carries the no-mutation clause`, () => {
      const missing = REQUIRED_MARKERS.filter((marker) => !content.includes(marker));

      expect(
        missing,
        `${file} is a read-only reviewer agent but is missing these required markers ` +
          `from its no-mutation clause: ${missing.join(", ")}. Add a clause forbidding ` +
          `git add/checkout/stash/apply against the main checkout, pointing at the worker's ` +
          `worktree (.claude/worktrees/agent-<taskId>/) as the sanctioned alternative.`
      ).toEqual([]);
    });
  }
});
