---
name: prisma-migrations
description: This skill should be used when the user asks to "create a migration", "run prisma migrate", "deploy database changes", "baseline a database", "set up Prisma CI/CD", or mentions database schema deployment. Provides Prisma Migrate best practices for development and production.
---

# Prisma Migrations Skill

This skill provides best practices for managing database schema changes with Prisma Migrate, covering development workflows, production deployments, CI/CD integration, and handling existing databases.

## Overview

Prisma Migrate is a declarative database migration tool that keeps your database schema in sync with your Prisma schema. It creates a migration history (SQL files) that can be version-controlled and deployed consistently across environments.

**Key Concepts:**
- **Migration files**: SQL files stored in `prisma/migrations/` that represent schema changes
- **Migration history**: The `_prisma_migrations` table tracks which migrations have been applied
- **Shadow database**: A temporary database used during `migrate dev` to detect drift

## When to Use Prisma Migrate

| Scenario | Tool | Reason |
|----------|------|--------|
| Adding/modifying tables in development | `prisma migrate dev` | Creates versioned migration files |
| Deploying to staging/production | `prisma migrate deploy` | Applies pending migrations safely |
| Quick prototyping (no migration history needed) | `prisma db push` | Syncs schema without creating migrations |
| Checking migration status | `prisma migrate status` | Shows pending/applied migrations |

## Development Workflow

### Creating Migrations

When you modify `schema.prisma`, create a migration:

```bash
npx prisma migrate dev --name descriptive_name
```

This command:
1. Creates a new migration file in `prisma/migrations/`
2. Applies the migration to your development database
3. Regenerates Prisma Client

**Best practices for migration names:**
- Use snake_case: `add_user_preferences`
- Be descriptive: `add_email_verified_column` not `update_users`
- Include the action: `create_`, `add_`, `remove_`, `rename_`

### Preview Without Applying

To see what SQL will be generated without applying:

```bash
npx prisma migrate dev --create-only
```

Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`, then apply with:

```bash
npx prisma migrate dev
```

### Development Reset

If you need to reset your development database completely:

```bash
npx prisma migrate reset
```

**Warning**: This drops all data. Only use in development.

## Production Workflow

### The Golden Rule

> **NEVER run `prisma migrate dev` in production.**

`migrate dev` can drop and recreate tables, losing data. It's designed for development iteration, not production safety.

### Deploying Migrations

In production (and CI/CD), always use:

```bash
npx prisma migrate deploy
```

This command:
- Only applies pending migrations that exist in `prisma/migrations/`
- Never creates new migrations
- Fails safely if migrations cannot be applied
- Does not require a shadow database

### Deployment Checklist

Before deploying database changes:

1. **Migrations are committed**: All migration files are in version control
2. **Migrations tested locally**: Run `migrate deploy` against a local copy of production
3. **Backup exists**: Have a database backup before applying migrations
4. **Order is correct**: Deploy migrations before new application code

## Command Reference

| Command | Environment | Purpose |
|---------|-------------|---------|
| `prisma migrate dev` | Development | Create and apply migrations |
| `prisma migrate dev --name <name>` | Development | Create named migration |
| `prisma migrate dev --create-only` | Development | Generate SQL without applying |
| `prisma migrate deploy` | Production/CI | Apply pending migrations |
| `prisma migrate status` | Any | Check migration status |
| `prisma migrate reset` | Development | Drop DB and reapply all migrations |
| `prisma migrate resolve --applied <name>` | Production | Mark migration as applied |
| `prisma migrate resolve --rolled-back <name>` | Production | Mark migration as rolled back |
| `prisma db push` | Development | Sync schema without migrations |

## Common Mistakes to Avoid

### 1. Using `migrate dev` in Production

```bash
# WRONG - Can cause data loss
DATABASE_URL=production npx prisma migrate dev

# CORRECT - Safe for production
DATABASE_URL=production npx prisma migrate deploy
```

### 2. Using `db push` for Production Deployments

```bash
# WRONG - No migration history, can't roll back
npx prisma db push

# CORRECT - Creates versioned migrations
npx prisma migrate dev --name add_feature
# Then deploy with:
npx prisma migrate deploy
```

### 3. Skipping Local Testing

Always test migrations against a copy of production data before deploying:

```bash
# Restore production backup locally
pg_restore -d mydb_local production_backup.dump

# Test migrations
DATABASE_URL=local npx prisma migrate deploy
```

### 4. Deploying Code Before Migrations

If your code references new columns/tables that don't exist yet, it will fail.

**Correct order:**
1. Deploy migrations (database changes)
2. Deploy application code
3. Clean up old code/columns later

## CI/CD Integration

For automated deployments, add migrations to your pipeline. See [CI/CD Patterns](references/ci-cd-patterns.md) for detailed examples.

**Quick GitHub Actions example:**

```yaml
jobs:
  deploy:
    steps:
      - name: Apply database migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Baselining Existing Databases

If you have an existing production database created with `db push` or raw SQL, you need to "baseline" it before using Prisma Migrate. See [Baselining Guide](references/baselining-guide.md) for the full process.

**Quick overview:**
1. Create initial migration with `--create-only`
2. Mark it as already applied with `migrate resolve --applied`
3. Future migrations work normally

## Troubleshooting

See [Troubleshooting Guide](references/troubleshooting.md) for solutions to common issues:

- Migration failed partway through
- Shadow database connection issues
- Drift detected between schema and database
- `P3009`: Migration marked as failed

## Scripts and Examples

- [GitHub Actions workflow](examples/github-action.yml) - Complete CI/CD setup
- [Migration deployment script](examples/migration-script.sh) - Safe production deployment
- [Check pending migrations](scripts/check-pending.sh) - Utility script for CI

## Quick Decision Tree

```
Need to change the database schema?
│
├─ Is this production/staging?
│  │
│  ├─ Yes → Use `prisma migrate deploy`
│  │        (applies existing migrations only)
│  │
│  └─ No (development) → Use `prisma migrate dev`
│                        (creates and applies migrations)
│
└─ Just prototyping/experimenting?
   │
   └─ Use `prisma db push` (no migration history)
```

## Summary

- **Development**: `prisma migrate dev` creates migration files
- **Production**: `prisma migrate deploy` applies them safely
- **Never**: Run `migrate dev` in production
- **Always**: Commit migrations to version control
- **Order**: Deploy migrations before application code
