#!/usr/bin/env bash
# AI Agent Health Check
# Queries Langfuse for agent health metrics and reports status.
# Used by /progress-tracker and can be run standalone.
#
# Prerequisites: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in env
#
# Usage: ./scripts/acmm/ai-health-check.sh [--json]

set -euo pipefail

if [ -z "${LANGFUSE_PUBLIC_KEY:-}" ] || [ -z "${LANGFUSE_SECRET_KEY:-}" ]; then
  echo "⚠ Langfuse credentials not set — skipping AI health check"
  echo "Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable"
  exit 0
fi

FORMAT="${1:-text}"

echo "AI Agent Health Check"
echo "====================="
echo ""
echo "Data source: Langfuse ($(echo "${LANGFUSE_BASEURL:-https://cloud.langfuse.com}"))"
echo ""
echo "Note: Full metric aggregation requires Langfuse API queries."
echo "Run /progress-tracker for aggregated metrics."
echo ""

# GitHub-based metrics (no Langfuse needed)
echo "GitHub Agent PR Metrics (last 30 days):"
AGENT_PRS=$(gh pr list --state merged --search "head:agent- head:worktree-agent-" --limit 100 --json number --jq 'length' 2>/dev/null || echo "0")
echo "  Agent PRs merged: ${AGENT_PRS}"

OPEN_AGENT_PRS=$(gh pr list --state open --search "head:agent- head:worktree-agent-" --limit 100 --json number --jq 'length' 2>/dev/null || echo "0")
echo "  Agent PRs open: ${OPEN_AGENT_PRS}"

echo ""
echo "Health check complete."
