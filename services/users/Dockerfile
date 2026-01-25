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
COPY services/users/package.json ./services/users/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY packages/auth ./packages/auth
COPY packages/config ./packages/config
COPY services/users ./services/users

# Generate Prisma client and build
RUN pnpm --filter @mbe/users-service db:generate
RUN pnpm --filter @mbe/users-service build

# Production stage
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files
COPY packages/types/package.json ./packages/types/
COPY packages/auth/package.json ./packages/auth/
COPY services/users/package.json ./services/users/

# Copy Prisma schema first (needed for generate)
COPY services/users/prisma ./services/users/prisma

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Generate Prisma client in production node_modules
RUN pnpm --filter @mbe/users-service db:generate

# Copy source files for TypeScript packages (no build step needed)
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/auth/src ./packages/auth/src

# Copy built users service
COPY --from=builder /app/services/users/dist ./services/users/dist

USER app

WORKDIR /app/services/users

EXPOSE 3001

CMD ["node", "dist/index.js"]
