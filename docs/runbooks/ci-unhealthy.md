# Runbook: CI Unhealthy

## Quick Diagnosis

```bash
# Check recent CI runs on main
gh run list --branch main --limit 10 --json name,conclusion,createdAt \
  -q '.[] | "\(.conclusion)\t\(.name)\t\(.createdAt)"'

# View the failing run's logs
gh run view <RUN_ID> --log-failed
```

## Common Causes

### 1. GitHub Actions billing/quota
- Error: "job was not started because recent account payments have failed"
- Fix: Update payment method at GitHub Settings > Billing & plans
- All workflows fail simultaneously when this happens

### 2. Flaky tests
- Look for `test` job failures that pass on retry
- Common culprits: timing-dependent tests, port conflicts, mock cleanup
- Retry: `gh run rerun <RUN_ID> --failed`

### 3. Dependency issue
- `pnpm install --frozen-lockfile` fails if lockfile is stale
- Fix: `pnpm install` locally, commit updated lockfile
- Check for yanked packages in error output

### 4. Type errors from recent merge
- `typecheck` job fails after merging incompatible changes
- Check which packages fail: look for `@mbe/<package>#typecheck` in logs
- May need to update types in `packages/types/`

### 5. Lint failures
- Pre-existing lint issues get caught when CI cache is invalidated
- Fix the lint errors or update `.eslintrc` if rules changed

## Recovery Steps

1. **If billing issue**: Update payment — no code fix needed
2. **If flaky test**: Retry the run, then fix the flaky test
3. **If real failure**: Check the specific job and step that failed, fix the code
4. **Quick retry**: `gh run rerun <RUN_ID> --failed`
