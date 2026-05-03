# Baselining Existing Databases

This guide explains how to introduce Prisma Migrate to a database that already has a schema, whether created with `prisma db push`, raw SQL, or another migration tool.

## What is Baselining?

Baselining creates an initial migration that represents your current database state, then marks it as "already applied" so Prisma doesn't try to run it again. This establishes a known starting point for future migrations.

## When You Need Baselining

- **Production database created with `db push`**: You've been using `prisma db push` and want to switch to proper migrations
- **Inherited database**: The database was created before Prisma was introduced
- **Manual schema changes**: DDL was run directly against production
- **Different tool migration**: Migrating from Knex, TypeORM, or raw SQL migrations

## The Baselining Process

### Step 1: Ensure Schema Matches Database

Your `schema.prisma` must accurately reflect the current database structure:

```bash
# Pull current database schema into Prisma
npx prisma db pull
```

Review the generated schema and commit it.

### Step 2: Create Initial Migration (Without Applying)

Generate the migration SQL without executing it:

```bash
npx prisma migrate dev --name initial_baseline --create-only
```

This creates `prisma/migrations/<timestamp>_initial_baseline/migration.sql` containing SQL to create all tables.

### Step 3: Review the Migration

Open the generated `migration.sql` and verify it represents your current schema. It should contain:

- All `CREATE TABLE` statements
- All indexes and constraints
- Any custom types or enums

### Step 4: Mark as Applied (Production)

On your production database, tell Prisma this migration is already applied:

```bash
npx prisma migrate resolve --applied <migration_name>
```

Example:

```bash
npx prisma migrate resolve --applied 20240115120000_initial_baseline
```

This adds a record to `_prisma_migrations` without running the SQL.

### Step 5: Apply Normally (Development)

On a fresh development database, run normally:

```bash
npx prisma migrate dev
```

This actually executes the migration (since the dev database is empty).

### Step 6: Verify

Check migration status on all environments:

```bash
npx prisma migrate status
```

Should show:

```
Database schema is up to date!
```

## Complete Example

Here's the full process for baselining a PostgreSQL production database:

```bash
# 1. Ensure you're working with current production schema
DATABASE_URL="production_url" npx prisma db pull

# 2. Review and commit schema.prisma changes
git add prisma/schema.prisma
git commit -m "chore: sync schema with production database"

# 3. Create baseline migration (locally)
npx prisma migrate dev --name initial_baseline --create-only

# 4. Review the generated SQL
cat prisma/migrations/*_initial_baseline/migration.sql

# 5. Commit the migration
git add prisma/migrations
git commit -m "chore: add baseline migration"
git push

# 6. Mark as applied on production (via CI/CD or manually)
DATABASE_URL="production_url" npx prisma migrate resolve --applied 20240115120000_initial_baseline

# 7. Verify
DATABASE_URL="production_url" npx prisma migrate status
# Output: Database schema is up to date!
```

## Multi-Environment Baselining

If you have staging and production with the same schema:

```bash
# Mark as applied on staging
DATABASE_URL="staging_url" npx prisma migrate resolve --applied 20240115120000_initial_baseline

# Mark as applied on production
DATABASE_URL="production_url" npx prisma migrate resolve --applied 20240115120000_initial_baseline
```

## Handling Schema Differences

If environments have slightly different schemas:

### Option 1: Sync First

Make all environments match, then baseline once:

```bash
# Run the same DDL on all environments to sync them
# Then baseline with one migration
```

### Option 2: Conditional Baselining

Create the baseline, then selectively mark as applied:

```bash
# If staging matches the baseline perfectly
DATABASE_URL="staging_url" npx prisma migrate resolve --applied 20240115120000_initial_baseline

# If production needs manual intervention first
psql "production_url" -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean;"
DATABASE_URL="production_url" npx prisma migrate resolve --applied 20240115120000_initial_baseline
```

## Baselining with Existing `_prisma_migrations` Table

If you've previously used Prisma Migrate and need to re-baseline:

### Clear Migration History (Careful!)

```bash
# Only if you're sure you want to start fresh
psql "$DATABASE_URL" -c "DELETE FROM _prisma_migrations;"
```

Then follow the standard baselining process.

### Or Resolve Existing Migrations

```bash
# Mark old migrations as rolled back
npx prisma migrate resolve --rolled-back old_migration_name

# Then resolve new baseline as applied
npx prisma migrate resolve --applied new_baseline_name
```

## Troubleshooting Baselining

### "Migration not found" Error

The migration name must match exactly:

```bash
# List migrations
ls prisma/migrations/

# Use the full directory name (without the path)
npx prisma migrate resolve --applied 20240115120000_initial_baseline
```

### Schema Drift After Baselining

If Prisma detects drift after baselining:

```bash
# Check what's different
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-url "$DATABASE_URL"
```

Fix the drift manually, then verify:

```bash
npx prisma migrate status
```

### Failed Baseline Migration

If the baseline migration fails on a fresh database:

1. Check the SQL for errors
2. The SQL might reference objects in wrong order
3. Edit `migration.sql` to fix ordering issues
4. Re-test on a fresh database

## CI/CD Baselining

For automated baselining in CI/CD:

```yaml
jobs:
  baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci

      - name: Check if baseline needed
        id: check
        run: |
          STATUS=$(npx prisma migrate status 2>&1) || true
          if echo "$STATUS" | grep -q "No migration has been applied yet"; then
            echo "needs_baseline=true" >> $GITHUB_OUTPUT
          else
            echo "needs_baseline=false" >> $GITHUB_OUTPUT
          fi
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Apply baseline
        if: steps.check.outputs.needs_baseline == 'true'
        run: |
          BASELINE_MIGRATION=$(ls prisma/migrations | grep baseline | head -1)
          npx prisma migrate resolve --applied "$BASELINE_MIGRATION"
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## After Baselining

Once baselining is complete:

1. **Future schema changes**: Use `prisma migrate dev` to create new migrations
2. **Deployments**: Use `prisma migrate deploy` as normal
3. **New team members**: Fresh `prisma migrate dev` applies all migrations from scratch

The baseline migration acts as your "year zero" - everything before it existed, everything after follows the normal migration workflow.

## Summary

1. Sync `schema.prisma` with current database (`db pull`)
2. Create baseline migration (`migrate dev --create-only`)
3. Mark as applied on existing databases (`migrate resolve --applied`)
4. Apply normally on fresh databases (`migrate dev`)
5. All future changes use standard migration workflow
