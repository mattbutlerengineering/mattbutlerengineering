#!/bin/sh
set -e

echo "Running users migrations..."
prisma migrate deploy --schema /app/services/users/prisma/schema.prisma

echo "Running reservations migrations..."
prisma migrate deploy --schema /app/services/reservations/prisma/schema.prisma

echo "All migrations complete."
