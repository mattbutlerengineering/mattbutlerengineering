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
COPY services/reservations/package.json ./services/reservations/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY packages/auth ./packages/auth
COPY packages/config ./packages/config
COPY services/reservations ./services/reservations

# Generate Prisma client and build
RUN pnpm --filter @mbe/reservations-service db:generate
RUN pnpm --filter @mbe/reservations-service build

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
COPY services/reservations/package.json ./services/reservations/

# Copy Prisma schema first (needed for generate)
COPY services/reservations/prisma ./services/reservations/prisma

# Install all dependencies (NODE_ENV unset to include devDeps for prisma CLI)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @mbe/reservations-service db:generate

# Now set NODE_ENV for runtime
ENV NODE_ENV=production

# Copy source files for TypeScript packages (no build step needed)
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/auth/src ./packages/auth/src

# Copy built reservations service
COPY --from=builder /app/services/reservations/dist ./services/reservations/dist

USER app

WORKDIR /app/services/reservations

EXPOSE 3004

CMD ["node", "dist/index.js"]
