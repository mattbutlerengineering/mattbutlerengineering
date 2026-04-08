# Prune stage — generate minimal monorepo subset
FROM node:22-alpine3.19 AS pruner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY . .

RUN pnpm turbo prune --docker @mbe/users-service

# Build stage
FROM node:22-alpine3.19 AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy pruned workspace files from pruner stage
COPY --from=pruner /app/out/pnpm-lock.yaml ./
COPY --from=pruner /app/out/pnpm-workspace.yaml ./
COPY --from=pruner /app/out/package.json ./
COPY --from=pruner /app/out/packages ./packages
COPY --from=pruner /app/out/services ./services

# Copy tsconfig files (needed for build, changes rarely)
COPY packages/config/typescript ./packages/config/typescript

# Copy Prisma schema (needed for db:generate)
COPY services/users/prisma ./services/users/prisma

# Copy source code (most frequently changing layer — last)
COPY packages/types/src ./packages/types/src
COPY packages/auth/src ./packages/auth/src
COPY packages/api-versioning/src ./packages/api-versioning/src
COPY packages/observability/src ./packages/observability/src
COPY packages/sentry/src ./packages/sentry/src
COPY services/users/src ./services/users/src

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build workspace packages and service in a single layer
RUN pnpm --filter @mbe/types build && \
    pnpm --filter @mbe/auth build && \
    pnpm --filter @mbe/api-versioning build && \
    pnpm --filter @mbe/observability build && \
    pnpm --filter @mbe/sentry build && \
    pnpm --filter @mbe/users-service db:generate && \
    pnpm --filter @mbe/users-service build

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
COPY --from=builder /app/services/users/prisma ./services/users/prisma

# Install all dependencies (NODE_ENV unset to include devDeps for prisma CLI)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @mbe/users-service db:generate

# Now set NODE_ENV for runtime
ENV NODE_ENV=production

# Copy compiled workspace packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth/dist ./packages/auth/dist
COPY --from=builder /app/packages/api-versioning/dist ./packages/api-versioning/dist
COPY --from=builder /app/packages/observability/dist ./packages/observability/dist
COPY --from=builder /app/packages/sentry/dist ./packages/sentry/dist

# Copy built users service
COPY --from=builder /app/services/users/dist ./services/users/dist
# Copy generated Prisma client (tsc doesn't copy .js files from src/ to dist/)
COPY --from=builder /app/services/users/src/generated/prisma ./services/users/dist/generated/prisma

USER app

WORKDIR /app/services/users

EXPOSE 3001

CMD ["node", "--conditions", "production", "dist/index.js"]
