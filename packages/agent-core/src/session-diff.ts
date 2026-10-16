import { runGit } from "./run-git.js";

/**
 * The whole of an agent session's change: everything in the worktree relative
 * to the merge-base with `baseBranch` — mid-session commits, the final commit,
 * and uncommitted/untracked edits alike.
 *
 * Unlike `getGitDiff` (`HEAD~1..HEAD`, the last commit only — right for the PR
 * gate, wrong for grading a whole session), this cannot be fooled by a session
 * that committed a production change early and left only tests for the last
 * commit, or that made no edits at all.
 *
 * Returns `""` when the session genuinely changed nothing, and `undefined`
 * when the diff could not be captured (bad worktree, unknown base, git error,
 * timeout, output too large) — callers must treat those differently.
 *
 * Marks untracked files intent-to-add in the worktree's index so they appear
 * in the diff; the worktree is the session's own and is discarded afterwards.
 */
export async function getSessionDiff(
  worktreePath: string,
  baseBranch: string
): Promise<string | undefined> {
  try {
    const mergeBase = await runGit(["merge-base", baseBranch, "HEAD"], { cwd: worktreePath });
    await runGit(["add", "--intent-to-add", "--all"], { cwd: worktreePath });
    return await runGit(["diff", mergeBase], { cwd: worktreePath });
  } catch {
    return undefined;
  }
}
