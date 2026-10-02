#!/usr/bin/env sh
# Pre-build step for Trigger.dev deploys (GitHub integration or CLI).
# Run from the repository root after `bun install`: watchdog/trigger-prebuild.sh api|app
set -eu

target="${1:?usage: watchdog/trigger-prebuild.sh api|app}"

(cd packages/integration-platform && bun run build)
(cd packages/email && bun run build)
(cd packages/db && bun run build)

# The API task build copies this file in as the CA bundle, so tasks verify Railway Postgres.
mkdir -p packages/db/certs
cp watchdog/railway-postgres-root-ca.crt packages/db/certs/rds-global-bundle.pem

case "$target" in
  api) (cd apps/api && bun run db:getschema) ;;
  app) (cd apps/app && bun run db:generate) ;;
  *) echo "unknown target: $target" >&2; exit 1 ;;
esac
