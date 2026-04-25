FROM node:22-alpine3.19

WORKDIR /app

# Install Prisma CLI v7 — must match @prisma/client major used by services.
# Prisma 7 dropped the schema-level `url` field; URL now comes from prisma.config.ts.
RUN npm install -g prisma@7

# Copy schemas, migrations, and per-service prisma.config.ts.
# COPY is cached; runtime SERVICE_NAME selects which set to run.
COPY services/users/prisma ./services/users/prisma
COPY services/users/prisma.config.ts ./services/users/prisma.config.ts
COPY services/reservations/prisma ./services/reservations/prisma
COPY services/reservations/prisma.config.ts ./services/reservations/prisma.config.ts
COPY services/agent/prisma ./services/agent/prisma
COPY services/agent/prisma.config.ts ./services/agent/prisma.config.ts

# Inline migration script (avoids .dockerignore excluding infrastructure/).
# SERVICE_NAME selects which service's migrations to run; cd into the service
# dir so Prisma 7 auto-discovers prisma.config.ts (which provides DATABASE_URL).
RUN printf '#!/bin/sh\nset -e\nif [ -z "$SERVICE_NAME" ]; then\n  echo "ERROR: SERVICE_NAME env var is required" >&2\n  exit 1\nfi\necho "Running $SERVICE_NAME migrations..."\ncd "/app/services/$SERVICE_NAME"\nprisma migrate deploy\necho "$SERVICE_NAME migrations complete."\n' > /migrate.sh && chmod +x /migrate.sh

CMD ["/migrate.sh"]
