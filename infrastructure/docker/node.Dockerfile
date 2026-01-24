# Base Node.js Dockerfile for services
# Usage: COPY this as a template for each service

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/auth/package.json ./packages/auth/
COPY packages/types/package.json ./packages/types/
# COPY services/SERVICE_NAME/package.json ./services/SERVICE_NAME/
RUN pnpm install --frozen-lockfile --prod=false

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/*/node_modules
COPY . .
# RUN pnpm --filter SERVICE_NAME build

# Production
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app
USER app
COPY --from=builder --chown=app:nodejs /app/packages ./packages
# COPY --from=builder --chown=app:nodejs /app/services/SERVICE_NAME/dist ./dist
# CMD ["node", "dist/index.js"]
