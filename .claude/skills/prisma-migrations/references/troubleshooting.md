# Troubleshooting Prisma Migrations

This guide covers common migration issues and their solutions.

## Migration Status Issues

### P3009: Failed Migration

**Error:**

```
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
```

**Cause**: A previous migration failed partway through, leaving the database in an inconsistent state.

**Solution 1: Fix and Mark Resolved**

```bash
# Check what failed
npx prisma migrate status

# Manually fix the database issue (apply missing changes)
psql "$DATABASE_URL" -c "ALTER TABLE ... ;"

# Mark the migration as applied
npx prisma migrate resolve --applied 20240115_failing_migration
```

**Solution 2: Mark as Rolled Back**

```bash
# If you've reverted the partial changes
npx prisma migrate resolve --rolled-back 20240115_failing_migration

# Then apply again
npx prisma migrate deploy
```

### Schema Drift Detected

**Error:**

```
Drift detected: Your database schema is not in sync with your migration history.
```

**Cause**: Someone made changes directly to the database that aren't in migration files.

**Solution: Identify and Reconcile**

```bash
# See what's different
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-url "$DATABASE_URL" \
  --script

# Option A: Create a migration to capture the changes
npx prisma migrate dev --name reconcile_drift

# Option B: Reset database to match migrations (DEVELOPMENT ONLY)
npx prisma migrate reset

# Option C: Manually revert the database changes
# Run inverse DDL against the database
```

### Migration Checksum Mismatch

**Error:**

```
The migration `20240115_add_users` has been modified after it was applied.
```

**Cause**: The `migration.sql` file was edited after being applied to the database.

**Solution:**

```bash
# Get the original file from git
git checkout main -- prisma/migrations/20240115_add_users/migration.sql

# Or if intentional, re-baseline (development only)
npx prisma migrate reset
```

## Connection Issues

### Shadow Database Access Denied

**Error:**

```
Error creating shadow database. You must have CREATE and DROP privileges.
```

**Cause**: The database user can't create/drop databases (needed for `migrate dev`).

**Solution 1: Grant Permissions**

```sql
-- PostgreSQL
GRANT CREATE ON DATABASE mydb TO myuser;

-- Or create a dedicated shadow database
CREATE DATABASE mydb_shadow OWNER myuser;
```

Then in `.env`:

```
SHADOW_DATABASE_URL="postgresql://myuser:pass@localhost:5432/mydb_shadow"
```

**Solution 2: Use Superuser for Development**

```bash
# Use a superuser for local development
DATABASE_URL="postgresql://postgres:pass@localhost:5432/mydb"
```

### Connection Pool Exhausted

**Error:**

```
Error: Connection pool timeout
```

**Cause**: Too many connections or pooler timeout during migrations.

**Solution: Use Direct Connection**

For migrations, bypass connection poolers:

```bash
# Instead of pooled connection
DATABASE_URL="postgresql://user:pass@pooler.host:6543/db?pgbouncer=true"

# Use direct connection
DATABASE_URL="postgresql://user:pass@direct.host:5432/db"
```

In CI/CD, use separate URLs:

```yaml
- name: Migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL_DIRECT }} # Direct connection
```

## Migration File Issues

### Editing Applied Migrations

**Problem**: You need to change a migration that's already been applied.

**Solution: Never Edit Applied Migrations**

Create a new migration instead:

```bash
# Wrong: Editing 20240115_add_users/migration.sql

# Right: Create a new migration
npx prisma migrate dev --name fix_users_table
```

### Migration Order Conflicts

**Error**: Conflicts when merging branches with migrations.

**Solution:**

```bash
# Option 1: Re-sequence migrations
# Rename the conflicting migration to have a later timestamp
mv prisma/migrations/20240115_feature_a \
   prisma/migrations/20240116_feature_a

# Option 2: Squash and re-create
npx prisma migrate reset  # Development only
# Then create a fresh migration with combined changes
npx prisma migrate dev --name combined_feature
```

## Data-Related Issues

### Non-Empty Column Added

**Error:**

```
The column `email` is required, but there are 100 rows with no value.
```

**Cause**: Adding a required column to a table with existing data.

**Solution: Multi-Step Migration**

```sql
-- Step 1: Add as nullable
ALTER TABLE users ADD COLUMN email TEXT;

-- Step 2: Backfill data
UPDATE users SET email = 'unknown@example.com' WHERE email IS NULL;

-- Step 3: Make required
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
```

Or use Prisma's expand/contract pattern:

```bash
# Migration 1: Add nullable column
npx prisma migrate dev --name add_email_nullable

# Deploy, run backfill script

# Migration 2: Make required
npx prisma migrate dev --name make_email_required
```

### Foreign Key Constraint Violations

**Error:**

```
Foreign key constraint failed on the field: `user_id`
```

**Cause**: Deleting/modifying data that's referenced elsewhere.

**Solution: Proper Ordering**

```sql
-- Delete referencing data first
DELETE FROM posts WHERE user_id = 1;
-- Then delete referenced data
DELETE FROM users WHERE id = 1;
```

Or add cascading in schema:

```prisma
model Post {
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId Int
}
```

## Production-Specific Issues

### Migration Takes Too Long

**Problem**: Large table migrations cause timeouts.

**Solution: Batch Operations**

Edit the migration SQL to work in batches:

```sql
-- Instead of:
-- UPDATE large_table SET new_col = 'value';

-- Use batched updates:
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE large_table
    SET new_col = 'value'
    WHERE id IN (
      SELECT id FROM large_table
      WHERE new_col IS NULL
      LIMIT batch_size
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

### Locking Issues

**Problem**: Migration locks tables, blocking application.

**Solution: Use CONCURRENTLY (PostgreSQL)**

```sql
-- Instead of:
-- CREATE INDEX idx_users_email ON users(email);

-- Use concurrent (doesn't lock):
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

Note: `CONCURRENTLY` cannot be used in transactions, so edit the migration to not use transactions:

```bash
# In prisma/migrations/XXX/migration.sql, add at the top:
-- migration:no-transaction

CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

### Partial Migration State

**Problem**: Migration failed midway, database is partially migrated.

**Solution: Manual Recovery**

```bash
# 1. Identify what was applied
psql "$DATABASE_URL" -c "\dt"  # Check tables
psql "$DATABASE_URL" -c "\d users"  # Check columns

# 2. Compare with migration SQL
cat prisma/migrations/20240115_migration/migration.sql

# 3. Manually apply remaining statements or roll back applied ones

# 4. Mark migration appropriately
npx prisma migrate resolve --applied 20240115_migration
# OR
npx prisma migrate resolve --rolled-back 20240115_migration
```

## Development Issues

### Reset Not Working

**Error:**

```
Error: Database reset failed
```

**Solution:**

```bash
# Force drop connections (PostgreSQL)
psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'mydb' AND pid <> pg_backend_pid();"

# Then reset
npx prisma migrate reset --force
```

### Seeding Fails After Migration

**Problem**: `prisma migrate reset` runs seed, but seed data doesn't match new schema.

**Solution: Update Seed Script**

Update `prisma/seed.ts` to match current schema before resetting.

```bash
# Or skip seeding
npx prisma migrate reset --skip-seed
```

## Diagnostic Commands

```bash
# Check current status
npx prisma migrate status

# Compare schema to database
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-url "$DATABASE_URL"

# Compare migrations to database
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-url "$DATABASE_URL" \
  --script

# View migration history in database
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC;"
```

## When to Contact Support

- Persistent "failed migration" that won't resolve
- Data corruption after migration
- Prisma Client and database out of sync after successful migration
- Shadow database issues in managed database environments

Document the issue with:

1. Full error message
2. `prisma migrate status` output
3. Schema and migration files involved
4. Database provider and version
