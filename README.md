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

> First boot pulls several images and builds the app/worker (multi-minute). **ClamAV** may sit "starting" briefly while clamd warms up.
>
> ⚠️ Corrected in Story 3.3's guard audit: this used to say ClamAV "downloads virus definitions on startup". It does not — Story 3.7b verified on the running container that the signature databases are BAKED INTO the pinned image (`main.cvd` and `bytecode.cvd` carry the image build date; only `daily.cld` is fetched later). The 360s `start_period` is slack, not a download budget.

Services: `app` (:3000) · `worker` · `postgres` (:5432) · `redis` (:6379) · `redis-queue` (:6380) · `minio` (:9000, console :9001) · `clamav` (:3310).

### Running the worker (Story 3.3)

The worker sends the RFQ notification and the sender confirmation. In compose it
runs automatically; to run it on the host against the compose services:

```bash
docker compose up -d redis-queue    # the durable queue instance (:6380)
npm run worker
```

> ⚠️ **`npx tsx worker/index.ts` does NOT load `.env`** — measured, not assumed;
> neither does `tsx --env-file`. `npm run worker` uses
> `node --env-file=.env --import tsx`, which does. If the worker exits with
> "REDIS_QUEUE_URL is not set", check that YOUR `.env` actually has the line —
> `.env.example` gained it in Story 3.0, so a `.env` copied before then is
> missing it and the queue tests will SKIP rather than fail.

By default `EMAIL_PROVIDER=log`: the worker prints what it would send and mails
nobody. Set `EMAIL_PROVIDER=resend` with `EMAIL_API_KEY`, `EMAIL_FROM` and
`RFQ_NOTIFY_TO` to send for real.

**Operator tools** (all bounded — they fail fast against a down queue rather
than hanging):

```bash
npm run queue:failed   # list the dead-letter set
npm run queue:retry    # re-drive every failed job
npm run queue:replay   # re-enqueue leads whose enqueue never landed
```

`queue:replay` is safe to run at any time: the worker short-circuits on the
lead's own send-state columns, so re-enqueueing an already-emailed lead sends
nothing.

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
| `npm run worker` | Run the RFQ email worker on the host (loads `.env`; `npx tsx` alone does not) |
| `npm run queue:failed` | List the dead-letter set |
| `npm run queue:retry` | Re-drive every failed job |
| `npm run queue:replay` | Re-enqueue leads whose enqueue never landed |

CI (`.github/workflows/ci.yml`) runs lint + typecheck + build + test on push to `main` and on PRs.
