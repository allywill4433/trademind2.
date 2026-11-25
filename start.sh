#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is missing. Add a Postgres database and set DATABASE_URL."
  exit 1
fi

echo "[start] applying database schema…"
npx drizzle-kit push --force

echo "[start] launching TradeMind on 0.0.0.0:${PORT:-3000}"
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
