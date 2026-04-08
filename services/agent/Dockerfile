# Prune stage — generate minimal monorepo subset for this service
FROM node:22-alpine3.19 AS pruner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace metadata needed for turbo prune (all package.json files)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/gen/package.json ./apps/gen/
COPY apps/hospitality/package.json ./apps/hospitality/
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/rialto-web/package.json ./apps/rialto-web/
COPY infrastructure/pulumi/package.json ./infrastructure/pulumi/
COPY packages/agent-core/package.json ./packages/agent-core/
COPY packages/agent-test-utils/package.json ./packages/agent-test-utils/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/api-versioning/package.json ./packages/api-versioning/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/feature-flags/package.json ./packages/feature-flags/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/observability/package.json ./packages/observability/
COPY packages/rialto/package.json ./packages/rialto/
COPY packages/rialto-catalog/package.json ./packages/rialto-catalog/
COPY packages/rialto-plugin/package.json ./packages/rialto-plugin/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/types/package.json ./packages/types/
COPY services/agent/package.json ./services/agent/
COPY services/reservations/package.json ./services/reservations/
COPY services/users/package.json ./services/users/
COPY tools/cli/package.json ./tools/cli/

RUN pnpm turbo prune --docker @mbe/agent-service

# Build stage
FROM node:22-alpine3.19 AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy pruned workspace files from pruner stage
COPY --from=pruner /app/out/pnpm-lock.yaml ./
COPY --from=pruner /app/out/package.json ./
COPY --from=pruner /app/out/pnpm-workspace.yaml ./
COPY --from=pruner /app/out/packages ./packages
COPY --from=pruner /app/out/services ./services

# Copy tsconfig files (needed for build, changes rarely)
COPY packages/config/typescript ./packages/config/typescript

# Copy Prisma schema (needed for db:generate)
COPY services/agent/prisma ./services/agent/prisma

# Copy source code (most frequently changing layer — last)
COPY packages/types/src ./packages/types/src
COPY packages/auth/src ./packages/auth/src
COPY packages/api-versioning/src ./packages/api-versioning/src
COPY packages/agent-core/src ./packages/agent-core/src
COPY packages/observability/src ./packages/observability/src
COPY packages/sentry/src ./packages/sentry/src
COPY packages/rialto/src ./packages/rialto/src
COPY packages/rialto-catalog/src ./packages/rialto-catalog/src
COPY services/agent/src ./services/agent/src

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build workspace packages and service in a single layer
RUN pnpm --filter @mbe/types build && \
    pnpm --filter @mbe/auth build && \
    pnpm --filter @mbe/api-versioning build && \
    pnpm --filter @mbe/observability build && \
    pnpm --filter @mbe/sentry build && \
    pnpm --filter @mbe/agent-core build && \
    pnpm --filter @mbe/rialto-catalog build && \
    pnpm --filter @mbe/agent-service db:generate && \
    pnpm --filter @mbe/agent-service build

# Production stage
FROM node:22-alpine3.19 AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app

# Copy pruned workspace files from pruner stage
COPY --from=pruner /app/out/pnpm-lock.yaml ./
COPY --from=pruner /app/out/pnpm-workspace.yaml ./
COPY --from=pruner /app/out/package.json ./
COPY --from=pruner /app/out/packages ./packages
COPY --from=pruner /app/out/services ./services

# Copy Prisma schema (needed for generate)
COPY --from=builder /app/services/agent/prisma ./services/agent/prisma

# Install all dependencies (NODE_ENV unset to include devDeps for prisma CLI)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @mbe/agent-service db:generate

# Now set NODE_ENV for runtime
ENV NODE_ENV=production

# Copy compiled workspace packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth/dist ./packages/auth/dist
COPY --from=builder /app/packages/api-versioning/dist ./packages/api-versioning/dist
COPY --from=builder /app/packages/observability/dist ./packages/observability/dist
COPY --from=builder /app/packages/sentry/dist ./packages/sentry/dist
COPY --from=builder /app/packages/agent-core/dist ./packages/agent-core/dist
COPY --from=builder /app/packages/rialto-catalog/dist ./packages/rialto-catalog/dist

# Copy built agent service
COPY --from=builder /app/services/agent/dist ./services/agent/dist
# Copy generated Prisma client (tsc doesn't copy .js files from src/ to dist/)
COPY --from=builder /app/services/agent/src/generated/prisma ./services/agent/dist/generated/prisma

USER app

WORKDIR /app/services/agent

EXPOSE 3003

CMD ["node", "--conditions", "production", "dist/index.js"]
