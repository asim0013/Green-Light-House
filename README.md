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

The app, worker, and backing services (Postgres, **two Redis instances**, MinIO, ClamAV) run via Docker Compose.

```bash
cp .env.example .env      # REQUIRED FIRST — compose reads env_file: .env
docker compose up -d
```

> First boot pulls several images and builds the app/worker (multi-minute). **ClamAV** downloads virus definitions on startup and can sit "starting" for a few minutes before healthy.

Services: `app` (:3000) · `worker` · `postgres` (:5432) · `redis` (:6379) · `redis-queue` (:6380) · `minio` (:9000, console :9001) · `clamav` (:3310).

### The two Redis instances are not interchangeable

`redis` (:6379, `REDIS_URL`) backs the Next incremental cache and is **disposable**. `redis-queue` (:6380, `REDIS_QUEUE_URL`) backs BullMQ and is **durable** — FR29 ("no inquiry is ever lost") depends on it, and it runs with `appendonly yes` on its own volume.

**Never point them at the same instance, and never `FLUSHALL`.** `FLUSHALL` empties every database on an instance (`FLUSHDB` is the per-database command), and `maxmemory`, eviction policy and persistence are instance-wide too — so neither a separate DB index nor a key prefix would protect the queue. To empty the cache, use the command below, which deletes by prefix on the cache URL only and refuses to run against the queue.

```bash
npm run cache:flush
```

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
| `npm run cache:flush` | Empty the incremental cache by prefix (**replaces `FLUSHALL`** — refuses to run against the queue instance) |

CI (`.github/workflows/ci.yml`) runs lint + typecheck + build + test on push to `main` and on PRs.
