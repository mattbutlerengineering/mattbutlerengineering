# Build stage
FROM node:22-alpine3.19@sha256:40dc4b415c17b85bea9be05314b4a753f45a4e1716bb31c01182e6c53d51a654 AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all workspace packages we depend on
COPY packages/types/package.json ./packages/types/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/observability/package.json ./packages/observability/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/database/package.json ./packages/database/
COPY services/users/package.json ./services/users/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy tsconfig files (needed for build, changes rarely)
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/auth/tsconfig.json ./packages/auth/
COPY packages/config/typescript ./packages/config/typescript
COPY packages/api-client/tsconfig.json ./packages/api-client/
COPY packages/observability/tsconfig.json ./packages/observability/
COPY packages/sentry/tsconfig.json ./packages/sentry/
COPY packages/database/tsconfig.json ./packages/database/
COPY services/users/tsconfig.json ./services/users/

# Copy Prisma schema (needed for db:generate)
COPY services/users/prisma ./services/users/prisma

# Copy source code (most frequently changing layer — last)
COPY packages/types/src ./packages/types/src
COPY packages/auth/src ./packages/auth/src
COPY packages/api-client/src ./packages/api-client/src
COPY packages/observability/src ./packages/observability/src
COPY packages/sentry/src ./packages/sentry/src
COPY packages/database/src ./packages/database/src
COPY services/users/src ./services/users/src

# Build workspace packages and service in a single layer
RUN pnpm --filter @mbe/types build && \
    pnpm --filter @mbe/auth build && \
    pnpm --filter @mbe/api-client build && \
    pnpm --filter @mbe/observability build && \
    pnpm --filter @mbe/sentry build && \
    pnpm --filter @mbe/database build && \
    pnpm --filter @mbe/users-service db:generate && \
    pnpm --filter @mbe/users-service build

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
COPY packages/config/package.json ./packages/config/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/observability/package.json ./packages/observability/
COPY packages/sentry/package.json ./packages/sentry/
COPY packages/database/package.json ./packages/database/
COPY services/users/package.json ./services/users/

# Install production dependencies only (Prisma client is copied from builder)
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled workspace packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth/dist ./packages/auth/dist
COPY --from=builder /app/packages/api-client/dist ./packages/api-client/dist
COPY --from=builder /app/packages/observability/dist ./packages/observability/dist
COPY --from=builder /app/packages/sentry/dist ./packages/sentry/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist

# Copy built users service
COPY --from=builder /app/services/users/dist ./services/users/dist
# Copy generated Prisma client (tsc doesn't copy .js files from src/ to dist/)
COPY --from=builder /app/services/users/src/generated/prisma ./services/users/dist/generated/prisma

USER app

WORKDIR /app/services/users

EXPOSE 3001

CMD ["node", "--conditions", "production", "dist/index.js"]
