# syntax=docker/dockerfile:1
# GREENLIGHTHOUSE web app — multi-stage build using Next.js standalone output.

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Story 5.8 (review F1): analytics is configured at BUILD time — the domain is
# inlined into the client bundle and the same-origin `rewrites()` to PLAUSIBLE_HOST
# are baked into routes-manifest.json. Runtime env cannot enable it. Empty (the
# default) = analytics fully off. `.dockerignore` excludes `.env*`, so these MUST
# arrive as build args (docker-compose.yml wires them from the project `.env`).
ARG NEXT_PUBLIC_ANALYTICS_DOMAIN=""
ARG PLAUSIBLE_HOST=""
ENV NEXT_PUBLIC_ANALYTICS_DOMAIN=$NEXT_PUBLIC_ANALYTICS_DOMAIN
ENV PLAUSIBLE_HOST=$PLAUSIBLE_HOST
# The Prisma client must be generated from the schema BEFORE `next build`: the
# `deps` stage runs `npm ci` with only package*.json present, so @prisma/client's
# postinstall has no schema to generate from. Without this the type-check fails
# (`@prisma/client` has no exported member `Locale`) — the image had not built
# since 2026-07-31 (found during the Story 5.8 review, F1).
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
