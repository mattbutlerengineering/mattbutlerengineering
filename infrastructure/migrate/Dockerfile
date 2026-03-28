FROM node:22-alpine

WORKDIR /app

# Install prisma CLI directly — no workspace resolution needed
RUN npm install -g prisma@6

# Copy Prisma schemas and migrations for all services
COPY services/users/prisma ./services/users/prisma
COPY services/reservations/prisma ./services/reservations/prisma
COPY services/agent/prisma ./services/agent/prisma

# Inline migration script to avoid .dockerignore excluding infrastructure/
RUN printf '#!/bin/sh\nset -e\necho "Running users migrations..."\nprisma migrate deploy --schema /app/services/users/prisma/schema.prisma\necho "Running reservations migrations..."\nprisma migrate deploy --schema /app/services/reservations/prisma/schema.prisma\necho "Running agent migrations..."\nprisma migrate deploy --schema /app/services/agent/prisma/schema.prisma\necho "All migrations complete."\n' > /migrate.sh && chmod +x /migrate.sh

CMD ["/migrate.sh"]
