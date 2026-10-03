# OncoBrief web tier — production image (ADR 0016).
#
# pnpm monorepo: workspace packages (@oncobrief/domain, ports, adapters, db)
# export TypeScript source and are transpiled by Next (see apps/web/next.config.ts),
# so the image ships the workspace and its node_modules, then runs `next start`.
#
# Build from the repository root:
#   docker build -t oncobrief-dev-web:latest .
#
# The image contains no secrets. DATABASE_URL, the session cookie secret and the
# scoped S3 credentials are injected at runtime from Secrets Manager by the ECS
# task definition.

FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @oncobrief/web build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["pnpm", "--filter", "@oncobrief/web", "start"]
