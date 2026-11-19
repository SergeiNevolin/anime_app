# syntax=docker/dockerfile:1.7

###############################################################################
# Frontend image: multi stage build using the Next.js standalone output.
###############################################################################
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /app

###############################################################################
FROM base AS deps

# The lock file and the package manager configuration have to be copied before
# the installation, so that the layout of node_modules is reproducible.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

###############################################################################
FROM deps AS builder

# The public configuration is not baked into the bundle: it is read from the
# container environment on every request (see src/app/layout.tsx).
COPY . .

# The build needs the development dependencies (typescript, tailwind, ...),
# therefore every dependency is installed in this stage.  The runtime image
# only receives the traced output of the standalone build.
RUN pnpm build

###############################################################################
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
