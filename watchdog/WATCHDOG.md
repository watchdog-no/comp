# Watchdog's CompAI install

This fork (`watchdog-no/comp`) runs Watchdog's internal compliance platform. Everything
Watchdog-specific lives in this `watchdog/` directory so that pulling upstream is a clean merge.

## Layout

| Service | Hostname | Built from | Railway config |
| --- | --- | --- | --- |
| App (`apps/app`) | `trust.watchdog.no` | `watchdog/Dockerfile.app` | `watchdog/railway.app.json` |
| Portal (`apps/portal`) | `portal.trust.watchdog.no` | `watchdog/Dockerfile.portal` | `watchdog/railway.portal.json` |
| API (`apps/api`) | `api.trust.watchdog.no` | `apps/api/Dockerfile.multistage` (upstream, unchanged) | `watchdog/railway.api.json` |
| Postgres | private network only | Railway Postgres | – |

Background jobs run on Trigger.dev cloud in two projects (`CompAI App`, `CompAI API`). Files are
in Cloudflare R2 (EU), buckets `watchdog-comp-prod-*`. Secrets are kept in GCP Secret Manager as
`watchdog-comp-prod-*` and copied into Railway and Trigger.dev variables.

The API and portal sit under `trust.watchdog.no` so the session cookie can be scoped to
`trust.watchdog.no` (`AUTH_COOKIE_DOMAIN`) instead of all of `watchdog.no`.

## Updating from upstream

1. Sync the fork: GitHub's "Sync fork" button on `main`, or `git fetch upstream && git merge upstream/main && git push`.
   Always merge; never rebase or squash upstream history.
2. Railway builds and deploys the three services from `main`. The API's pre-deploy command applies
   database migrations first; if it or a health check fails, the previous version keeps running.
3. Trigger.dev deploys both task projects from the same push.

If a Railway build fails after a sync, compare `watchdog/Dockerfile.app` and
`watchdog/Dockerfile.portal` with how upstream builds (root `Dockerfile`, `apps/*/package.json`
`build:docker`). Upstream's own GitHub workflows are disabled in the fork's Actions settings.

Check that our changes are still separate: `git diff upstream/main --stat` should list only
`watchdog/` and the files under "Changes to upstream files".

## Changes to upstream files

Each is one small commit of its own and inert unless its variable is set.

| Change | Files | Variable | Upstream PR |
| --- | --- | --- | --- |
| Restrict sign-up to allowed email domains or invited emails | `apps/api/src/auth/auth.server.ts`, `apps/api/src/auth/signup-policy.ts` (+ spec) | `AUTH_ALLOWED_EMAIL_DOMAINS` | not opened yet |
| Configurable session cookie domain | `apps/api/src/auth/auth.server.ts` | `AUTH_COOKIE_DOMAIN` | not opened yet |

## Access

Sign-up is limited to `@watchdog.no` addresses and to emails with a pending invitation. To let an
auditor in, invite their email under People with the auditor role; nobody else at their firm can
create an account.

## Build notes

- `next build` inlines `NEXT_PUBLIC_*` values, so they are Docker build args. Railway passes a
  service variable to the build for each `ARG` the Dockerfile declares. Changing one needs a rebuild.
- Our Dockerfiles switch off the type check inside `next build` (it needs more than 8 GB). Upstream
  CI type-checks the same commits.
- Migrations: `cd packages/db && node ../../node_modules/prisma/build/index.js migrate deploy`,
  run inside the API image as the pre-deploy command.
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

## Deliberately off

Unset, and what enables each: Stripe billing (`STRIPE_*`), Upstash Redis rate limiting
(`UPSTASH_REDIS_REST_*`), Upstash Vector for questionnaire and knowledge-base search
(`UPSTASH_VECTOR_REST_*`), PostHog, Novu, Dub, Browserbase, Firecrawl, Fleet device agent,
background checks, hosted MCP (`GRAM_*`), pentests (real `MACED_API_KEY`), custom trust-page
domains (`VERCEL_*`, `TRUST_PORTAL_PROJECT_ID`).

Known gaps on R2: a few API paths build their S3 client without `APP_AWS_ENDPOINT`
(knowledge-base and questionnaire processing, policy PDF handling in `policies.controller.ts`,
the device agent download). They will fail until fixed upstream; core evidence uploads use the
shared client and work.
