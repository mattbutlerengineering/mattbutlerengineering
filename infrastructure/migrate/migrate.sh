#!/bin/sh
set -e

echo "Running users migrations..."
cd /app/services/users
npx prisma migrate deploy

echo "Running reservations migrations..."
cd /app/services/reservations
npx prisma migrate deploy

echo "All migrations complete."
