# ACMM State Recovery

`.claude/acmm/state.json` is a git-tracked file, committed automatically by
every `acmm-regression.yml` run that finds a change (see
`.github/workflows/acmm-regression.yml`). Its own `git log` history is the
backup — there is no separate backup workflow or artifact to manage.

## Recovery Steps

1. **Find the last good commit:**

   ```bash
   git log --oneline -- .claude/acmm/state.json
   ```

2. **Inspect a prior version without touching the working tree:**

   ```bash
   git show <sha>:.claude/acmm/state.json | python3 -m json.tool | head -20
   ```

3. **Restore it:**

   ```bash
   git checkout <sha> -- .claude/acmm/state.json
   ```

4. **Re-run the audit to regenerate the report:**

   ```bash
   node plugins/acmm/scripts/audit.js
   ```

5. **Verify restoration:**

   ```bash
   cat .claude/acmm/state.json | python3 -m json.tool | head -5
   ```

## History

Before #5854, a separate `acmm-state-backup.yml` workflow uploaded weekly
`state.json`/`report.md` snapshots as GitHub Actions artifacts (90-day
retention) for recovery. It was retired: `state.json` is already git-tracked
and committed on every audit run, so a second, artifact-based backup of a
file git already versions added no recovery capability that
`git log`/`git show`/`git checkout` didn't already provide.
