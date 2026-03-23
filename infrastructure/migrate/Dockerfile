FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for both services and their dependencies
COPY packages/types/package.json ./packages/types/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY services/users/package.json ./services/users/
COPY services/reservations/package.json ./services/reservations/

# Install dependencies (need devDeps for prisma CLI)
RUN pnpm install --frozen-lockfile

# Copy Prisma schemas and migrations for both services
COPY services/users/prisma ./services/users/prisma
COPY services/reservations/prisma ./services/reservations/prisma

# Generate Prisma clients
RUN pnpm --filter @mbe/users-service db:generate
RUN pnpm --filter @mbe/reservations-service db:generate

# Copy migration script
COPY infrastructure/migrate/migrate.sh /migrate.sh
RUN chmod +x /migrate.sh

CMD ["/migrate.sh"]
