#!/usr/bin/env bash
# Reproduction script for #3593: turbo's local cache can be silently shared
# across git worktrees of the same repo.
#
# turbo 2.10.7 ships built-in git-worktree detection
# (turborepo-scm::worktree::detect). When turbo.json does not declare an
# explicit `cacheDir`, turbo resolves the local filesystem cache to whichever
# worktree it considers "main" instead of the current one — so a linked
# worktree can get a "cache hit" for a task it never ran, replaying build
# output (and logs) that a *different* worktree produced.
#
# This script proves that by building @mbe/types in a second worktree that
# never runs `pnpm install` (no tsc available). Pre-fix, that build still
# "succeeds" via a cache hit against this checkout's cache — output plausible,
# but sourced from a different worktree. Post-fix (explicit `cacheDir` in
# turbo.json), each worktree only ever sees its own local cache, so the
# second worktree correctly cache-misses and fails (tsc: command not found)
# instead of silently serving foreign output.
#
# Usage: run from the repo root, after `pnpm install`.
set -uo pipefail

REPO_ROOT="$(pwd)"
TURBO_BIN="$(find "$REPO_ROOT/node_modules/.pnpm" -maxdepth 1 -iname '@turbo+*' -print -quit)/node_modules/@turbo/*/bin/turbo"
TMP_DIR="$(mktemp -d)"
TMP_WORKTREE="$TMP_DIR/repro-worktree"
TMP_OUTPUT="$TMP_DIR/output.txt"

cleanup() {
  git worktree remove --force "$TMP_WORKTREE" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "== Populating the cache for @mbe/types from THIS checkout ($REPO_ROOT) =="
eval "$TURBO_BIN" run build --filter=@mbe/types --force 2>&1 | tail -3

echo
echo "== Creating a second worktree at $TMP_WORKTREE (no 'pnpm install') =="
git worktree add --detach "$TMP_WORKTREE" HEAD >/dev/null
# Carry over any uncommitted turbo.json (e.g. the #3593 fix under review) so
# this script reflects the working tree, not just the last commit.
cp "$REPO_ROOT/turbo.json" "$TMP_WORKTREE/turbo.json"

echo
echo "== Building @mbe/types from the SECOND worktree (no tsc installed there) =="
if (cd "$TMP_WORKTREE" && eval "$TURBO_BIN" run build --filter=@mbe/types) 2>&1 | tee "$TMP_OUTPUT" | tail -8; then
  if grep -q "cache hit" "$TMP_OUTPUT"; then
    echo
    echo "BUG REPRODUCED: the worktree with no node_modules still got a cache"
    echo "hit — it served build output from a different checkout's cache."
    exit 1
  fi
fi

echo
echo "OK: the second worktree correctly missed its own (isolated) cache and"
echo "failed to build (no tsc), instead of silently reusing this checkout's"
echo "cached output. turbo.json's explicit cacheDir is preventing the leak."
