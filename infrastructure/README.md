# Infrastructure

Infrastructure as Code and edge routing for mattbutlerengineering.com.

## Components

| Directory            | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `pulumi/`            | Pulumi (TypeScript) IaC -- manages DigitalOcean, Cloudflare, and Auth0 resources |
| `worker/`            | Cloudflare Worker edge router -- routes traffic by path prefix                   |
| `migrate/`           | Pre-deploy migration job Dockerfile                                              |
| `docker-compose.yml` | Local PostgreSQL for development                                                 |

## Architecture

```
Client -> mattbutlerengineering.com (Cloudflare Worker)
  /hospitality*  -> Workers Static Assets (Service Binding)
  /rialto*       -> Workers Static Assets (Service Binding)
  /gen*          -> Workers Static Assets (Service Binding)
  /api/*         -> api.mattbutlerengineering.com (DigitalOcean)
  /*             -> Workers Static Assets (marketing, catch-all)
```

## Local Development

```bash
# Start PostgreSQL
docker compose up postgres -d

# Or use the root command that handles everything:
pnpm dev:local
```

See [pulumi/README.md](pulumi/README.md) for infrastructure deployment details and [CLAUDE.md](CLAUDE.md) for the full resource inventory.
