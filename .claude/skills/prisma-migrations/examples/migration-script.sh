#!/bin/bash
#
# Safe Prisma migration deployment script
#
# This script:
# 1. Checks for pending migrations
# 2. Creates a database backup (optional)
# 3. Applies migrations with proper error handling
# 4. Verifies the final state
#
# Usage:
#   ./migration-script.sh                    # Apply migrations
#   ./migration-script.sh --backup           # Backup first, then apply
#   ./migration-script.sh --dry-run          # Check status only
#
# Required environment:
#   DATABASE_URL - Production database connection string

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
BACKUP=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --backup)
      BACKUP=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
  esac
done

# Verify DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
  exit 1
fi

echo -e "${GREEN}=== Prisma Migration Deployment ===${NC}"
echo ""

# Check current migration status
echo "Checking migration status..."
STATUS=$(npx prisma migrate status 2>&1) || true

if echo "$STATUS" | grep -q "Database schema is up to date"; then
  echo -e "${GREEN}No pending migrations. Database is up to date.${NC}"
  exit 0
fi

echo "$STATUS"
echo ""

# If dry run, exit here
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Dry run complete. Use without --dry-run to apply migrations.${NC}"
  exit 0
fi

# Optional backup
if [ "$BACKUP" = true ]; then
  echo -e "${YELLOW}Creating database backup...${NC}"
  BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"

  # Extract database name from URL for pg_dump
  # This is a simplified extraction - adjust for your URL format
  if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/dev/null; then
    echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
  else
    echo -e "${YELLOW}Warning: Backup failed. Continuing without backup.${NC}"
  fi
  echo ""
fi

# Apply migrations
echo -e "${YELLOW}Applying migrations...${NC}"
if npx prisma migrate deploy; then
  echo ""
  echo -e "${GREEN}Migrations applied successfully!${NC}"
else
  echo ""
  echo -e "${RED}Migration failed!${NC}"
  echo ""
  echo "To troubleshoot:"
  echo "  1. Check the error message above"
  echo "  2. Run: npx prisma migrate status"
  echo "  3. If partially applied, fix manually then run:"
  echo "     npx prisma migrate resolve --applied <migration_name>"
  echo ""
  if [ "$BACKUP" = true ] && [ -f "$BACKUP_FILE" ]; then
    echo "To restore from backup:"
    echo "  psql \"\$DATABASE_URL\" < $BACKUP_FILE"
  fi
  exit 1
fi

# Verify final state
echo ""
echo "Verifying migration status..."
npx prisma migrate status

echo ""
echo -e "${GREEN}=== Migration deployment complete ===${NC}"
