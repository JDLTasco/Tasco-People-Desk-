#!/usr/bin/env bash
# Sets app_role's local Postgres password from .env's APP_ROLE_PASSWORD.
#
# Deliberately NOT part of a Prisma migration: a migration file is version
# controlled and applied identically in every environment, and a password
# has no business inside version-controlled SQL (build spec §0.1.8). In
# Azure this whole script has no equivalent -- the app authenticates via
# managed identity, not a password (§2, §6).
#
# Run after `prisma migrate dev` has created app_role (see
# prisma/migrations/*_audit_log_grants). Safe to re-run.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
  echo "No .env found -- copy .env.example to .env and fill in local values first." >&2
  exit 1
fi

set -a
source .env
set +a

: "${APP_ROLE_PASSWORD:?APP_ROLE_PASSWORD not set in .env}"
: "${POSTGRES_SUPERUSER_PASSWORD:?POSTGRES_SUPERUSER_PASSWORD not set in .env}"

# Runs psql inside the postgres container itself -- no host psql client
# is assumed to be installed.
docker compose exec -T -e PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD" postgres \
  psql -U postgres -d tasco_people_desk -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE app_role WITH PASSWORD '${APP_ROLE_PASSWORD}';"

echo "app_role password set."
