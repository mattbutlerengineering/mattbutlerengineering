# Turborepo Remote Cache

This document describes the remote caching configuration for CI/CD optimization.

## Overview

Turborepo's remote cache stores build artifacts in Vercel's infrastructure, allowing:
- **Faster CI builds**: Skip tasks already completed on other branches
- **Shared caching**: Local `pnpm dev` can use CI cache
- **Reduced compute costs**: Less time running redundant builds

## Configuration

### Repository Variables (GitHub Actions)

| Variable | Value | Purpose |
|----------|-------|---------|
| `TURBO_TEAM` | `mattbutlerengineering` | Vercel team slug for cache namespace |

### Repository Secrets (GitHub Actions)

| Secret | Purpose |
|--------|---------|
| `TURBO_TOKEN` | Vercel API token for authentication |

## Setup Instructions

### 1. Create Vercel Account

If you don't have a Vercel account:
1. Sign up at [vercel.com](https://vercel.com)
2. Create a team named `mattbutlerengineering` (or your preferred name)

### 2. Generate Vercel API Token

1. Go to [Vercel Dashboard > Settings > Tokens](https://vercel.com/dashboard/settings/tokens)
2. Click "Create Token"
3. Name: `turborepo-cache-ci`
4. Scope: Select the `mattbutlerengineering` team
5. Copy the generated token

### 3. Add Secrets to GitHub

```bash
# Add TURBO_TOKEN secret
gh secret set TURBO_TOKEN --body "<your-vercel-token>"

# TURBO_TEAM is already set to mattbutlerengineering
gh api repos/mattbutlerengineering/mattbutlerengineering/actions/variables/TURBO_TEAM
```

### 4. Verify Configuration

The CI workflow automatically:
1. Runs `turbo login --token` in the prepare job
2. Links to the remote cache with `turbo link --team`
3. Subsequent turbo commands use the cached artifacts

## Local Setup

To use remote cache locally:

```bash
# Login to Vercel
npx turbo login

# Link to the team
npx turbo link --team mattbutlerengineering

# Verify remote caching is enabled
npx turbo remote cache ls
```

## CI Behavior

Without `TURBO_TOKEN`:
- CI runs with local caching only
- Build times are unaffected
- No errors occur

With `TURBO_TOKEN`:
- Turbo authenticates with Vercel Remote Cache
- Build artifacts are fetched/stored remotely
- Cache hits speed up builds significantly

## Viewing Cache

```bash
# List cached artifacts
npx turbo remote cache ls

# Get details of a specific artifact
npx turbo remote cache get <artifact-id>

# Tag artifacts for organization
npx turbo remote cache tag <artifact-id> <tag>
```

## Troubleshooting

### "Invalid token" errors

1. Verify `TURBO_TOKEN` is correctly set in GitHub secrets
2. Ensure the token hasn't expired
3. Check the token has team-level scope

### Cache misses on main

Expected when:
- First push to a new team
- Cache was cleared
- Build configuration changed significantly

### Local cache conflicts

If local and remote caches conflict:

```bash
# Clear local cache
pnpm turbo prune
rm -rf node_modules/.cache/turbo
```
