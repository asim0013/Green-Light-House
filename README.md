# GREENLIGHTHOUSE

B2B product-intelligence website for project-based supply of industrial + fire-rescue/protective equipment. **Not a store** — no prices, no cart, no checkout. EN/TR/RU. Built on Next.js 16 (App Router) + TypeScript + Tailwind + Prisma/PostgreSQL + Redis. See [`CLAUDE.md`](./CLAUDE.md) for engineering conventions.

## Prerequisites

- **Node.js 22+** and npm
- **Docker** (only for the full local stack — Postgres/Redis/MinIO/ClamAV/worker)

## Local setup

```bash
npm install
cp .env.example .env      # required — fill in as needed
npm run dev               # http://localhost:3000
```

## Full stack via Docker

The app, worker, and backing services (Postgres, Redis, MinIO, ClamAV) run via Docker Compose.

```bash
cp .env.example .env      # REQUIRED FIRST — compose reads env_file: .env
docker compose up -d
```

> First boot pulls several images and builds the app/worker (multi-minute). **ClamAV** downloads virus definitions on startup and can sit "starting" for a few minutes before healthy.

Services: `app` (:3000) · `worker` · `postgres` (:5432) · `redis` (:6379) · `minio` (:9000, console :9001) · `clamav` (:3310).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` / `test:watch` | Vitest (unit, co-located) |
| `npm run test:e2e` | Playwright (run `npx playwright install` once first) |
| `npm run format` / `format:check` | Prettier |

CI (`.github/workflows/ci.yml`) runs lint + typecheck + build + test on push to `main` and on PRs.
