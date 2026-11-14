# syntax=docker/dockerfile:1.7

###############################################################################
# Frontend image: multi stage build using the Next.js standalone output.
###############################################################################
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEV_AUTH_ENABLED
ARG NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /app

###############################################################################
FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --shamefully-hoist

###############################################################################
FROM deps AS builder

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEV_AUTH_ENABLED
ARG NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEV_AUTH_ENABLED=$NEXT_PUBLIC_DEV_AUTH_ENABLED \
    NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID=$NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID

COPY . .
RUN npm run build

###############################################################################
FROM base AS runner

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEV_AUTH_ENABLED
ARG NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEV_AUTH_ENABLED=$NEXT_PUBLIC_DEV_AUTH_ENABLED \
    NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID=$NEXT_PUBLIC_DEV_AUTH_TELEGRAM_ID

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]