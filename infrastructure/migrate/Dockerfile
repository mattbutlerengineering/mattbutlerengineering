FROM node:22-alpine3.19

WORKDIR /app

# Install Prisma CLI v7 — must match @prisma/client major used by services.
# Prisma 7 dropped the schema-level `url` field; URL now comes from prisma.config.ts.
RUN npm install -g prisma@7

# prisma.config.ts imports `from "prisma/config"`, which Node resolves only if
# the global node_modules dir is on NODE_PATH. Without this, the config loader
# fails with "Cannot find module 'prisma/config'" when run from a service dir.
ENV NODE_PATH=/usr/local/lib/node_modules

# Non-root user (mirrors services/users/Dockerfile). HOME must be writable —
# Prisma's engine/query-cache writes there at runtime — otherwise `prisma
# migrate deploy` fails under the unprivileged user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 app && \
    mkdir -p /home/app && \
    chown -R app:nodejs /home/app
ENV HOME=/home/app

# Copy schemas, migrations, and per-service prisma.config.ts.
# COPY is cached; runtime SERVICE_NAME selects which set to run.
# Each prisma.config.ts is a thin re-export of packages/database/src/prisma-config.ts via a
# RELATIVE import (not the "@mbe/database" package specifier, which would need pnpm-installed
# node_modules that this image never creates) — so that shared file must be copied too, at the
# same relative depth the import expects.
COPY packages/database/src/prisma-config.ts ./packages/database/src/prisma-config.ts
COPY services/users/prisma ./services/users/prisma
COPY services/users/prisma.config.ts ./services/users/prisma.config.ts
COPY services/reservations/prisma ./services/reservations/prisma
COPY services/reservations/prisma.config.ts ./services/reservations/prisma.config.ts
COPY services/agent/prisma ./services/agent/prisma
COPY services/agent/prisma.config.ts ./services/agent/prisma.config.ts

# Inline migration script (avoids .dockerignore excluding infrastructure/).
# SERVICE_NAME selects which service's migrations to run; cd into the service
# dir so Prisma 7 auto-discovers prisma.config.ts (which provides DATABASE_URL).
# Single quotes around the printf format are intentional — $SERVICE_NAME must
# be written literally into /migrate.sh, not expanded at Docker build time.
# hadolint ignore=SC2016
RUN printf '#!/bin/sh\nset -e\nif [ -z "$SERVICE_NAME" ]; then\n  echo "ERROR: SERVICE_NAME env var is required" >&2\n  exit 1\nfi\necho "Running $SERVICE_NAME migrations..."\ncd "/app/services/$SERVICE_NAME"\nprisma migrate deploy\necho "$SERVICE_NAME migrations complete."\n' > /migrate.sh && chmod +x /migrate.sh

RUN chown -R app:nodejs /app /migrate.sh

USER app

CMD ["/migrate.sh"]
