#!/usr/bin/env bash
# The idea-to-prod Conductor's gate (.github/factory.json conductor.gate_command).
# It has to be one command, with no shell operators, because it is also the
# headless Worker's only Bash permission. So it installs dependencies itself:
# a fresh Conductor worktree has no node_modules. Not --frozen-lockfile: a
# Worker that changes a dependency needs the gate to write the lockfile, and
# CI still installs frozen.
set -euo pipefail
pnpm install --prefer-offline
pnpm exec turbo run lint typecheck test --affected
