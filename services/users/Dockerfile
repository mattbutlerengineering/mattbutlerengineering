# Build stage
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all workspace packages we depend on
COPY packages/types/package.json ./packages/types/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/observability/package.json ./packages/observability/
COPY packages/sentry/package.json ./packages/sentry/
COPY services/users/package.json ./services/users/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY packages/auth ./packages/auth
COPY packages/config ./packages/config
COPY packages/observability ./packages/observability
COPY packages/sentry ./packages/sentry
COPY services/users ./services/users

# Build workspace packages and service
RUN pnpm --filter @mbe/types build
RUN pnpm --filter @mbe/auth build
RUN pnpm --filter @mbe/observability build
RUN pnpm --filter @mbe/sentry build
RUN pnpm --filter @mbe/users-service db:generate
RUN pnpm --filter @mbe/users-service build

# Production stage
FROM node:22-alpine AS runner

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
COPY packages/observability/package.json ./packages/observability/
COPY packages/sentry/package.json ./packages/sentry/
COPY services/users/package.json ./services/users/

# Copy Prisma schema first (needed for generate)
COPY services/users/prisma ./services/users/prisma

# Install all dependencies (NODE_ENV unset to include devDeps for prisma CLI)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @mbe/users-service db:generate

# Now set NODE_ENV for runtime
ENV NODE_ENV=production

# Copy compiled workspace packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/auth/dist ./packages/auth/dist
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
