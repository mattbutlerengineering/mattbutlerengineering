# CI/CD Patterns for Prisma Migrations

This guide covers integrating Prisma Migrate into your CI/CD pipeline, with patterns for various platforms and deployment strategies.

## Core Principles

1. **Migrations run before application deployment** - The database schema must be ready before code that depends on it
2. **Use `migrate deploy` only** - Never use `migrate dev` in CI/CD
3. **Store secrets securely** - Database URLs should be in CI/CD secrets, not committed
4. **Run migrations once** - Avoid multiple instances racing to migrate

## GitHub Actions

### Basic Migration Workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Apply database migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  deploy:
    needs: migrate # Wait for migrations to complete
    runs-on: ubuntu-latest
    steps:
      - name: Deploy application
        run: |
          # Your deployment commands here
```

### With Migration Status Check

```yaml
jobs:
  check-migrations:
    runs-on: ubuntu-latest
    outputs:
      pending: ${{ steps.check.outputs.pending }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci

      - name: Check pending migrations
        id: check
        run: |
          STATUS=$(npx prisma migrate status 2>&1) || true
          if echo "$STATUS" | grep -q "Database schema is up to date"; then
            echo "pending=false" >> $GITHUB_OUTPUT
          else
            echo "pending=true" >> $GITHUB_OUTPUT
          fi
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  migrate:
    needs: check-migrations
    if: needs.check-migrations.outputs.pending == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Multi-Environment Deployment

```yaml
name: Deploy to Environment

on:
  push:
    branches:
      - main # Production
      - staging # Staging

jobs:
  migrate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci

      - name: Set environment
        id: env
        run: |
          if [ "${{ github.ref }}" = "refs/heads/main" ]; then
            echo "DATABASE_URL=${{ secrets.PROD_DATABASE_URL }}" >> $GITHUB_ENV
            echo "env_name=production" >> $GITHUB_OUTPUT
          else
            echo "DATABASE_URL=${{ secrets.STAGING_DATABASE_URL }}" >> $GITHUB_ENV
            echo "env_name=staging" >> $GITHUB_OUTPUT
          fi

      - name: Apply migrations to ${{ steps.env.outputs.env_name }}
        run: npx prisma migrate deploy

      - name: Deploy application
        run: |
          # Environment-specific deployment
```

## Vercel

Vercel runs `prisma generate` automatically when it detects a Prisma schema. For migrations:

### Option 1: Separate Migration Job (Recommended)

Run migrations in GitHub Actions before Vercel deployment:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        run: vercel deploy --prod
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

### Option 2: Build-time Migrations

Add to your build script in `package.json`:

```json
{
  "scripts": {
    "vercel-build": "prisma migrate deploy && prisma generate && next build"
  }
}
```

**Caution**: This runs migrations on every preview deployment. Better for simple setups.

## Railway

Railway can run migrations as a one-off command:

```bash
# In Railway CLI
railway run npx prisma migrate deploy
```

Or configure in `railway.json`:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npx prisma generate"
  },
  "deploy": {
    "startCommand": "npx prisma migrate deploy && npm start"
  }
}
```

## Docker Deployments

### Migration Container Pattern

Create a migration-only container that runs before the app:

```dockerfile
# Dockerfile.migrate
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
CMD ["npx", "prisma", "migrate", "deploy"]
```

Docker Compose:

```yaml
version: "3.8"
services:
  migrate:
    build:
      context: .
      dockerfile: Dockerfile.migrate
    environment:
      DATABASE_URL: ${DATABASE_URL}
    depends_on:
      db:
        condition: service_healthy

  app:
    build: .
    depends_on:
      migrate:
        condition: service_completed_successfully
```

### Kubernetes Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: prisma-migrate
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: myapp:latest
          command: ["npx", "prisma", "migrate", "deploy"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
      restartPolicy: Never
  backoffLimit: 3
```

## Migration Locking

When multiple instances might run migrations simultaneously:

### Advisory Locks (PostgreSQL)

Prisma uses advisory locks by default. The first instance acquires the lock, others wait or fail gracefully.

### Manual Locking

For extra safety, add a wrapper:

```bash
#!/bin/bash
# migrate-with-lock.sh

LOCK_TABLE="_migration_lock"

# Try to acquire lock
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS $LOCK_TABLE (locked boolean);
  INSERT INTO $LOCK_TABLE SELECT true WHERE NOT EXISTS (SELECT 1 FROM $LOCK_TABLE);
" || exit 0  # Exit if lock exists

# Run migrations
npx prisma migrate deploy
RESULT=$?

# Release lock
psql "$DATABASE_URL" -c "DELETE FROM $LOCK_TABLE;"

exit $RESULT
```

## Testing Migrations in CI

Before deploying to production, test migrations against a production-like database:

```yaml
jobs:
  test-migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci

      - name: Test migrations
        run: |
          npx prisma migrate deploy
          npx prisma migrate reset --force  # Test rollback and reapply
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
```

## Rollback Strategies

Prisma doesn't support automatic rollbacks. Plan for failures:

### 1. Pre-Deployment Backup

```yaml
- name: Backup database
  run: |
    pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Manual Rollback Migration

Create a new migration that reverses the changes:

```bash
# After failed deployment
npx prisma migrate dev --name rollback_add_feature
# Edit the SQL to reverse the original migration
npx prisma migrate deploy
```

### 3. Mark as Rolled Back

If a migration was partially applied and you've manually fixed it:

```bash
npx prisma migrate resolve --rolled-back 20240101_add_feature
```

## Secrets Management

### GitHub Actions

Store in repository secrets:

- `DATABASE_URL` - Production database URL
- `STAGING_DATABASE_URL` - Staging database URL

### Environment-Specific URLs

```yaml
env:
  DATABASE_URL: ${{ github.ref == 'refs/heads/main' && secrets.PROD_DATABASE_URL || secrets.STAGING_DATABASE_URL }}
```

### Connection Pooling

Many deployment platforms require connection pooling. Use direct connection for migrations:

```yaml
- name: Migrate
  run: npx prisma migrate deploy
  env:
    # Direct connection for migrations
    DATABASE_URL: ${{ secrets.DATABASE_URL_DIRECT }}

- name: Deploy app
  env:
    # Pooled connection for app runtime
    DATABASE_URL: ${{ secrets.DATABASE_URL_POOLED }}
```

## Monitoring and Alerts

### Slack Notification on Failure

```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "Migration failed for ${{ github.repository }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Migration Failed* :x:\nRepo: ${{ github.repository }}\nBranch: ${{ github.ref }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Summary Checklist

- [ ] Migrations run before application deployment
- [ ] Using `prisma migrate deploy` (not `migrate dev`)
- [ ] Database URL stored in CI/CD secrets
- [ ] Separate database URLs for each environment
- [ ] Backup strategy in place
- [ ] Migration status checks before deploy
- [ ] Failure notifications configured
- [ ] Connection pooling handled correctly
