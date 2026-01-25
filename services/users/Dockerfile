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

# Generate Prisma client
RUN pnpm --filter @mbe/users-service db:generate

# Build users service (types and auth are TypeScript-only, no build needed)
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

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy source files for TypeScript packages (no build step needed)
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/auth/src ./packages/auth/src

# Copy built users service
COPY --from=builder /app/services/users/dist ./services/users/dist
COPY --from=builder /app/services/users/node_modules/.prisma ./services/users/node_modules/.prisma

# Copy Prisma schema for migrations
COPY services/users/prisma ./services/users/prisma

USER app

WORKDIR /app/services/users

EXPOSE 3001

CMD ["node", "dist/index.js"]
