FROM node:22-alpine3.19

WORKDIR /app

# Install prisma CLI directly — no workspace resolution needed
RUN npm install -g prisma@6

# Copy Prisma schemas and migrations for all services
# (COPY is cached and cheap — runtime SERVICE_NAME selects which to run)
COPY services/users/prisma ./services/users/prisma
COPY services/reservations/prisma ./services/reservations/prisma
COPY services/agent/prisma ./services/agent/prisma

# Inline migration script to avoid .dockerignore excluding infrastructure/
# SERVICE_NAME env var (set by DO App Platform job config) selects which
# service's migrations to run.  Each service gets its own pre-deploy job
# so failures are isolated per-service.
RUN printf '#!/bin/sh\nset -e\nif [ -z "$SERVICE_NAME" ]; then\n  echo "ERROR: SERVICE_NAME env var is required" >&2\n  exit 1\nfi\necho "Running $SERVICE_NAME migrations..."\nprisma migrate deploy --schema /app/services/$SERVICE_NAME/prisma/schema.prisma\necho "$SERVICE_NAME migrations complete."\n' > /migrate.sh && chmod +x /migrate.sh

CMD ["/migrate.sh"]
