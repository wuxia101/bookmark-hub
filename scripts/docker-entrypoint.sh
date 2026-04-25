#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[docker-entrypoint] running migrations"
  bun run db:migrate
fi

echo "[docker-entrypoint] starting BookmarkHub"
exec bun run start
