# Database Migration

Create a Prisma database migration for a service.

## Steps
1. Edit the schema at `services/<name>/prisma/schema.prisma`
2. Generate migration: `pnpm --dir services/<name> db:migrate -- --name <description>`
3. Review the generated SQL in `services/<name>/prisma/migrations/`
4. Regenerate the client: `pnpm --dir services/<name> db:generate`
5. Update any affected route handlers or repositories
6. Run tests: `pnpm --dir services/<name> test`

## Safety checks
- No destructive operations (DROP TABLE, DROP COLUMN) without explicit approval
- Add columns as nullable or with defaults to avoid breaking existing rows
- Keep Prisma version in sync between client and migrate Dockerfile
- Prisma 7 uses `prisma.config.ts` for connection URL — no `url` in schema
