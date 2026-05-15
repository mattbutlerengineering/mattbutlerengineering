# Worktree Lifecycle Policy

To maintain a clean and efficient development environment, all AI agents and human collaborators must follow this worktree lifecycle policy.

## Worktree Locations

1.  **Project Worktrees**: Located in `.agent-worktrees/` (inside the monorepo).
2.  **External Worktrees**: Located in `../agent-<ISSUE_NUMBER>` (relative to monorepo root).

## Lifecycle Stages

### 1. Creation

- Always use isolated worktrees for feature development, bug fixes, or audits.
- Use descriptive branch names: `fix/issue-<NUMBER>` or `feat/<DESCRIPTION>`.

### 2. Implementation

- Perform all work within the isolated worktree.
- Regularly sync the lockfile if dependencies change.

### 3. Verification

- All changes must pass `pnpm lint`, `pnpm typecheck`, and `pnpm test` within the worktree before merging.

### 4. Cleanup (CRITICAL)

- **Immediate Removal**: Once changes are committed and pushed (or a PR is created), the worktree MUST be removed.
- **Cleanup Commands**:
  - For full git worktrees: `git worktree remove <PATH> --force`
  - For lightweight clones: `rm -rf <PATH>`
- **Pruning**: Periodically run `git worktree prune` in the main repository to clean up references to deleted worktrees.

## Automated Enforcement

The `mbe cleanup-worktrees` command (planned) will automatically scan `.agent-worktrees/` and the parent directory for orphaned `agent-*` folders older than 24 hours and remove them.
