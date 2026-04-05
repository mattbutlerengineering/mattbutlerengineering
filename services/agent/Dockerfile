# Build stage
FROM node:22-alpine3.19 AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all workspace packages we depend on
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/auth/package.json ./packages/auth/
COPY packages/api-versioning/package.json ./packages/api-versioning/
COPY packages/agent-core/package.json ./packages/agent-core/
COPY packages/observability/package.json ./packages/observability/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/rialto/package.json ./packages/rialto/
COPY packages/rialto-catalog/package.json ./packages/rialto-catalog/
COPY services/agent/package.json ./services/agent/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy tsconfig files (needed for build, changes rarely)
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/config/typescript ./packages/config/typescript
COPY packages/auth/tsconfig.json ./packages/auth/
COPY packages/api-versioning/tsconfig.json ./packages/api-versioning/
COPY packages/agent-core/tsconfig.json ./packages/agent-core/
COPY packages/observability/tsconfig.json ./packages/observability/
COPY packages/sentry/tsconfig.json ./packages/sentry/
COPY packages/rialto/tsconfig.json ./packages/rialto/
COPY packages/rialto-catalog/tsconfig.json packages/rialto-catalog/tsconfig.build.json ./packages/rialto-catalog/
COPY services/agent/tsconfig.json ./services/agent/

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

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/auth/package.json ./packages/auth/
COPY packages/api-versioning/package.json ./packages/api-versioning/
COPY packages/agent-core/package.json ./packages/agent-core/
COPY packages/observability/package.json ./packages/observability/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/rialto/package.json ./packages/rialto/
COPY packages/rialto-catalog/package.json ./packages/rialto-catalog/
COPY services/agent/package.json ./services/agent/

# Copy Prisma schema first (needed for generate)
COPY services/agent/prisma ./services/agent/prisma

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
