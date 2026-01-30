#!/bin/bash
#
# Check for pending Prisma migrations
#
# Exit codes:
#   0 - No pending migrations (up to date)
#   1 - Pending migrations exist
#   2 - Error checking status
#
# Usage:
#   ./check-pending.sh              # Check and print status
#   ./check-pending.sh --quiet      # Exit code only, no output
#
# Useful in CI/CD to conditionally run migrations:
#   if ./check-pending.sh --quiet; then
#     echo "Already up to date"
#   else
#     npx prisma migrate deploy
#   fi

set -uo pipefail

QUIET=false
if [ "${1:-}" = "--quiet" ]; then
  QUIET=true
fi

# Check DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  [ "$QUIET" = false ] && echo "Error: DATABASE_URL not set"
  exit 2
fi

# Get migration status
STATUS=$(npx prisma migrate status 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  [ "$QUIET" = false ] && echo "Error checking migration status:"
  [ "$QUIET" = false ] && echo "$STATUS"
  exit 2
fi

# Check if up to date
if echo "$STATUS" | grep -q "Database schema is up to date"; then
  [ "$QUIET" = false ] && echo "No pending migrations"
  exit 0
else
  [ "$QUIET" = false ] && echo "Pending migrations detected:"
  [ "$QUIET" = false ] && echo "$STATUS"
  exit 1
fi
