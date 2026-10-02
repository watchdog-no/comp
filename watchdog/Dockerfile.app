# Admin app (apps/app) for Railway. Build context is the repository root.
# Upstream's root Dockerfile is not used: it lacks NEXT_PUBLIC_SELF_HOSTED and
# does not copy every workspace package the app now depends on.
FROM node:22-slim AS builder

RUN npm install -g bun@1.3.4

WORKDIR /app
COPY . .

RUN bun install --frozen-lockfile --ignore-scripts

# Build every workspace package the app depends on (db first: it generates the Prisma client)
RUN bunx turbo run build --filter=@trycompai/app^...

# Public values are inlined by `next build`; Railway passes service variables for each ARG
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SELF_HOSTED=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SELF_HOSTED=$NEXT_PUBLIC_SELF_HOSTED \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    NODE_OPTIONS=--max_old_space_size=6144

# Skip the type check inside `next build`: it needs more memory than the image
# build has, and upstream CI already type-checks every commit we deploy.
RUN sed -i 's/^const config\(: NextConfig\)\{0,1\} = {$/&\n  typescript: { ignoreBuildErrors: true },/' apps/app/next.config.ts \
  && grep -q 'ignoreBuildErrors' apps/app/next.config.ts

RUN cd apps/app && bun run db:getschema && SKIP_ENV_VALIDATION=true bun run build:docker

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000

COPY --from=builder /app/apps/app/.next/standalone ./
COPY --from=builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder /app/apps/app/public ./apps/app/public

USER node
EXPOSE 3000
CMD ["node", "apps/app/server.js"]
