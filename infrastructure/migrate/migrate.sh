#!/bin/sh
set -e

# Parameterized migration script — SERVICE_NAME env var selects which
# service to migrate.  The Dockerfile inlines this script (because
# .dockerignore excludes infrastructure/); this file is kept as a
# local-development reference.

if [ -z "$SERVICE_NAME" ]; then
  echo "ERROR: SERVICE_NAME env var is required" >&2
  exit 1
fi

echo "Running ${SERVICE_NAME} migrations..."
prisma migrate deploy --schema "/app/services/${SERVICE_NAME}/prisma/schema.prisma"
echo "${SERVICE_NAME} migrations complete."
