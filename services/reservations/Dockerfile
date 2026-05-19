# Build stage
FROM node:22-alpine3.19@sha256:40dc4b415c17b85bea9be05314b4a753f45a4e1716bb31c01182e6c53d51a654 AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all workspace packages we depend on
COPY packages/types/package.json ./packages/types/
COPY packages/auth/package.json ./packages/auth/
COPY packages/api-versioning/package.json ./packages/api-versioning/
COPY packages/config/package.json ./packages/config/
COPY packages/observability/package.json ./packages/observability/
COPY packages/feature-flags/package.json ./packages/feature-flags/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/database/package.json ./packages/database/
COPY packages/notifications/package.json ./packages/notifications/
COPY services/reservations/package.json ./services/reservations/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy tsconfig files (needed for build, changes rarely)
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/auth/tsconfig.json ./packages/auth/
COPY packages/api-versioning/tsconfig.json ./packages/api-versioning/
COPY packages/config/typescript ./packages/config/typescript
COPY packages/observability/tsconfig.json ./packages/observability/
COPY packages/feature-flags/tsconfig.json ./packages/feature-flags/
COPY packages/sentry/tsconfig.json ./packages/sentry/
COPY packages/database/tsconfig.json ./packages/database/
COPY packages/notifications/tsconfig.json ./packages/notifications/
COPY services/reservations/tsconfig.json ./services/reservations/

# Copy Prisma schema (needed for db:generate)
COPY services/reservations/prisma ./services/reservations/prisma

# Copy source code (most frequently changing layer — last)
COPY packages/types/src ./packages/types/src
COPY packages/auth/src ./packages/auth/src
COPY packages/api-versioning/src ./packages/api-versioning/src
COPY packages/observability/src ./packages/observability/src
COPY packages/feature-flags/src ./packages/feature-flags/src
COPY packages/sentry/src ./packages/sentry/src
COPY packages/database/src ./packages/database/src
COPY packages/notifications/src ./packages/notifications/src
COPY services/reservations/src ./services/reservations/src

# Build workspace packages and service in a single layer
RUN pnpm --filter @mbe/types build && \
    pnpm --filter @mbe/auth build && \
    pnpm --filter @mbe/api-versioning build && \
    pnpm --filter @mbe/observability build && \
    pnpm --filter @mbe/feature-flags build && \
    pnpm --filter @mbe/sentry build && \
    pnpm --filter @mbe/database build && \
    pnpm --filter @mbe/notifications build && \
    pnpm --filter @mbe/reservations-service db:generate && \
    pnpm --filter @mbe/reservations-service build

# Production stage
FROM node:22-alpine3.19@sha256:40dc4b415c17b85bea9be05314b4a753f45a4e1716bb31c01182e6c53d51a654 AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files
COPY packages/types/package.json ./packages/types/
COPY packages/auth/package.json ./packages/auth/
COPY packages/api-versioning/package.json ./packages/api-versioning/
COPY packages/config/package.json ./packages/config/
COPY packages/observability/package.json ./packages/observability/
COPY packages/feature-flags/package.json ./packages/feature-flags/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/database/package.json ./packages/database/
COPY packages/notifications/package.json ./packages/notifications/
COPY services/reservations/package.json ./services/reservations/

# Install production dependencies only (Prisma client is copied from builder)
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled workspace packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth/dist ./packages/auth/dist
COPY --from=builder /app/packages/api-versioning/dist ./packages/api-versioning/dist
COPY --from=builder /app/packages/observability/dist ./packages/observability/dist
COPY --from=builder /app/packages/feature-flags/dist ./packages/feature-flags/dist
COPY --from=builder /app/packages/sentry/dist ./packages/sentry/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/notifications/dist ./packages/notifications/dist

# Copy built reservations service
COPY --from=builder /app/services/reservations/dist ./services/reservations/dist
# Copy generated Prisma client (tsc doesn't copy .js files from src/ to dist/)
COPY --from=builder /app/services/reservations/src/generated/prisma ./services/reservations/dist/generated/prisma

USER app

WORKDIR /app/services/reservations

EXPOSE 3004

CMD ["node", "--conditions", "production", "dist/index.js"]
