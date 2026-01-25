# Project Guidelines for Claude

## Naming Conventions

- Use `mattbutlerengineering-` prefix for all external resources
- Examples:
  - Auth0 App: `mattbutlerengineering-app`
  - Auth0 API: `mattbutlerengineering-api`
  - DigitalOcean resources: `mattbutlerengineering-*`
  - Database: `mattbutlerengineering-db`

## Project Structure

- Monorepo using Turborepo + pnpm
- Package prefix: `@mbe/`
- Infrastructure as Code: Pulumi (TypeScript) in `infrastructure/pulumi/`

## Auth0 Configuration

- Domain: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`
- API Identifier: `https://api.mattbutlerengineering.com`
- Managed via Pulumi IaC

## Local Development

```bash
# Start Postgres
cd infrastructure && docker compose up postgres -d

# Push database schema
cd services/users && pnpm db:push

# Start dev servers
pnpm dev
```

- Web: http://localhost:3000
- Dashboard: http://localhost:3002/dashboard
- API: http://localhost:3001
- API Docs: http://localhost:3001/docs
