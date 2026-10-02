# Watchdog's CompAI install

This fork (`watchdog-no/comp`) runs Watchdog's internal compliance platform. Everything
Watchdog-specific lives in this `watchdog/` directory so that pulling upstream is a clean merge.

## Layout

Railway project `compai` in the Watchdog workspace, region EU West.

| Service | Hostname | Dockerfile | Notes |
| --- | --- | --- | --- |
| `app` (`apps/app`) | `comp.watchdog.no` | `watchdog/Dockerfile.app` | health `/api/health`, `PORT=3000` |
| `portal` (`apps/portal`) | `portal.comp.watchdog.no` | `watchdog/Dockerfile.portal` | health `/`, `PORT=3000` |
| `api` (`apps/api`) | `api.comp.watchdog.no` | `apps/api/Dockerfile.multistage` (upstream, unchanged) | health `/v1/health`, pre-deploy runs migrations |
| `backup` | – | `watchdog/Dockerfile.backup` | cron, nightly `pg_dump` to R2 |
| `Postgres` | private network, plus a TCP proxy for Trigger.dev tasks | Railway Postgres 18 | volume in EU West |

Service settings (Dockerfile path, watch paths, health check, pre-deploy command, region) are set
on the Railway services, not in the repository: Railway has deprecated `railway.json`.

Background jobs run on Trigger.dev cloud in two projects in the Watchdog org: `CompAI App`
(`proj_hmbcsehxzjnapaottxsu`) and `CompAI API` (`proj_csjyfjqtuiyxbznqaohk`). Files are in
Cloudflare R2 (EU), buckets `watchdog-comp-prod-*`. Secrets are kept in GCP Secret Manager as
`watchdog-comp-prod-*` and copied into Railway and Trigger.dev variables.

The API and portal sit under `comp.watchdog.no` so the session cookie can be scoped to
`comp.watchdog.no` (`AUTH_COOKIE_DOMAIN`) instead of all of `watchdog.no`. `trust.watchdog.no` is
the public trust page (`TRUST_APP_URL`).

## Updating from upstream

1. Sync the fork: GitHub's "Sync fork" button on `main`, or `git fetch upstream && git merge upstream/main && git push`.
   Always merge; never rebase or squash upstream history.
2. Railway builds and deploys the services from `main`. The API's pre-deploy command applies
   database migrations first; if it or a health check fails, the previous version keeps running.
3. Deploy the Trigger.dev tasks (below) after every sync. Task code, shared packages, the Trigger
   config and its build extensions all end up in the task image, so there is no safe subset to skip.

If a Railway build fails after a sync, compare `watchdog/Dockerfile.app` and
`watchdog/Dockerfile.portal` with how upstream builds (root `Dockerfile`, `apps/*/package.json`
`build:docker`). Upstream's own GitHub workflows are disabled in the fork's Actions settings.

Check that our changes are still separate: `git diff upstream/main --stat` should list only
`watchdog/` and the files under "Changes to upstream files".

## Deploying the Trigger.dev tasks

`--project-ref` overrides the project hard-coded in upstream's `trigger.config.ts`, so those files
stay untouched. From a checkout with `bun install` done and `TRIGGER_ACCESS_TOKEN` set:

```bash
(cd packages/integration-platform && bun run build) && (cd packages/email && bun run build) && (cd packages/db && bun run build)
mkdir -p packages/db/certs && cp watchdog/railway-postgres-root-ca.crt packages/db/certs/rds-global-bundle.pem

cd apps/api && bun run db:getschema   # clears old copies of the split schema, then copies the current files
bunx trigger.dev@4.4.3 deploy --project-ref proj_csjyfjqtuiyxbznqaohk

cd ../app && bun run db:generate
bunx trigger.dev@4.4.3 deploy --project-ref proj_hmbcsehxzjnapaottxsu
```

Use the `trigger.dev` version pinned in `apps/*/package.json`. Each project has its own
environment variables in Trigger.dev (same values as the matching Railway service, with the
database's public proxy URL). The app project cannot be indexed without them.

Database TLS from the tasks: Railway Postgres presents a certificate signed by its own root CA
(`watchdog/railway-postgres-root-ca.crt`, valid until 2028-12-30). The API task build copies it in
as the CA bundle, so API tasks verify the server. The app task build has no such step and runs with
`PRISMA_ALLOW_INSECURE_TLS=1` (encrypted, server not verified). If Railway regenerates the
certificate, fetch the new root and redeploy the API tasks.

## Changes to upstream files

Each is one commit of its own. The two auth changes are inert unless their variable is set.

| Change | Files | Variable | Upstream PR |
| --- | --- | --- | --- |
| Restrict sign-up to allowed email domains or invited emails | `apps/api/src/auth/auth.server.ts`, `apps/api/src/auth/signup-policy.ts` (+ spec) | `AUTH_ALLOWED_EMAIL_DOMAINS` | not opened yet |
| Configurable session cookie domain | `apps/api/src/auth/auth.server.ts` | `AUTH_COOKIE_DOMAIN` | not opened yet |
| Current AI models, no `temperature` (Sonnet 5.5, Opus 5.5, Gemini 3.8 flash, gpt-6.1-sol, gpt-6-luna; Groq calls moved to gpt-6-luna) | 27 files under `apps/app/src` and `apps/api/src` | – | not for upstream; re-apply after syncs that touch these lines |

## Access

Sign-up is limited to `@watchdog.no` addresses and to emails with a pending invitation. To let an
auditor in, invite their email under People with the auditor role; nobody else at their firm can
create an account.

## Build notes

- `next build` inlines `NEXT_PUBLIC_*` values, so they are Docker build args. Railway passes a
  service variable to the build for each `ARG` the Dockerfile declares. Changing one needs a rebuild.
- Our Dockerfiles switch off the type check inside `next build` (it needs more than 8 GB). Upstream
  CI type-checks the same commits.
- Migrations: the API service's pre-deploy command, run inside the API image:
  `sh -c "cd /app/packages/db && node /app/node_modules/prisma/build/index.js migrate deploy 2>&1"`.
  Without the explicit `sh -c` it fails with no log output.
- Seeding (frameworks and controls) is a one-off, run from a checkout:
  `cd packages/db && DATABASE_URL=<public url> bun prisma/seed/seed.ts`.

## Variables that are easy to get wrong

- `NODE_EXTRA_CA_CERTS=` (empty) and `PRISMA_ALLOW_INSECURE_TLS=1` on the API: the image ships an
  AWS RDS CA bundle and would otherwise reject Railway Postgres' self-signed certificate.
  `PRISMA_ALLOW_INSECURE_TLS=1` is also needed on the app and portal.
- `ENCRYPTION_KEY` encrypts stored integration credentials. Losing it makes them unreadable.
- `AUTH_TRUSTED_ORIGINS` replaces the built-in list; it must name the app, portal and trust page origins.
- `MACED_API_KEY=mc_dev_disabled`: the API refuses to start without a key of that shape, although
  we do not use the pentest module.
- `TRUST_APP_URL` must be set in production or the API does not start.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (Upstash database `compai-prod`,
  eu-central-1) are required in practice: the setup flow keeps its session in Redis and returns 500
  without it. `MOCK_REDIS=true` is not a substitute; it causes a redirect loop on `/setup`.
- `PORT=3000` on the app and portal: Railway otherwise injects its own port and the domain returns 502.

## Backups and monitoring

The `backup` service runs at 02:00 UTC, writes `postgres/compai-<timestamp>.dump` (custom format)
to `watchdog-comp-prod-backups` and pings a Better Stack heartbeat. A lifecycle rule on the bucket
deletes dumps after 30 days. Restore with `pg_restore --no-owner --dbname=<url> <file>`.
Better Stack has uptime monitors for the three health endpoints.

## Deliberately off

Unset, and what enables each: Stripe billing (`STRIPE_*`), Upstash Vector for questionnaire and knowledge-base search
(`UPSTASH_VECTOR_REST_*`), PostHog, Novu, Dub, Browserbase, Firecrawl, Fleet device agent,
background checks, hosted MCP (`GRAM_*`), pentests (real `MACED_API_KEY`), custom trust-page
domains (`VERCEL_*`, `TRUST_PORTAL_PROJECT_ID`).

Known gaps on R2: a few API paths build their S3 client without `APP_AWS_ENDPOINT`
(knowledge-base and questionnaire processing, policy PDF handling in `policies.controller.ts`,
the device agent download). They will fail until fixed upstream; core evidence uploads use the
shared client and work.
