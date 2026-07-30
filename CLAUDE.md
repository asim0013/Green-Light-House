# GREENLIGHTHOUSE — Engineering Conventions

B2B product-intelligence website (industrial + fire-rescue/protective equipment). **Not a store** — no prices, no cart, no checkout. North star = qualified project inquiries (RFQs). Runs EN/TR/RU; single-admin CMS. Everything public is generated from one **Product Intelligence Database (PID)**.

**Source of truth for planning** (in the `_bmad-output` workspace, not this repo):
`planning-artifacts/prds/prd-GLH-2026-07-27/`, `architecture/architecture-GLH-2026-07-27.md`, `ux-designs/ux-GLH-2026-07-27/{DESIGN,EXPERIENCE}.md`, `epics-GLH-2026-07-28.md`. Stories: `implementation-artifacts/GLH/`.

## Stack (locked)

Next.js 16.2 (App Router, RSC/SSR, Turbopack) · React 19 · TypeScript **strict** · Tailwind v4 · Prisma + PostgreSQL · Redis (cache + BullMQ) · next-intl (EN/TR/RU) · Auth.js (single admin) · S3-compatible storage (R2/MinIO) · ClamAV · container/VPS hosting. Do **not** swap the framework or add T3/tRPC/a headless CMS.

## Naming

- **DB (Postgres):** tables `snake_case` plural (`products`, `product_translations`); columns `snake_case`; PK `id`; FK `<entity>_id`; `created_at` / `updated_at`. Prisma models `PascalCase` singular via `@@map`.
- **API:** resource paths plural/kebab (`/api/products`, `/api/rfq`); route params `[id]`; **JSON `camelCase` at the boundary** (Prisma snake mapped).
- **Code:** components `PascalCase` files (`ProductCard.tsx`); hooks `useX`; utils/functions `camelCase`; types/interfaces `PascalCase`; constants `UPPER_SNAKE`.

## Structure (`src/`)

`app/[locale]/(public)` + `app/[locale]/admin` routes · `app/api` route handlers · `components/{ui,catalog,rfq,projects,admin,layout}` · `server/{repositories,services,queue,i18n}` · `lib/` (db, auth, redis, cache-tags, storage, mailer, zod, logger) · `i18n/` · `messages/{en,tr,ru}.json` · `prisma/` · `worker/` (BullMQ) · `scripts/`. Tests co-located `*.test.ts(x)`; e2e in `/e2e`.

## Format

- **Success:** return data directly. **Error:** `{ error: { code, message, details? } }` + proper HTTP status; **zod validation → 422** with field-level errors.
- Dates **ISO-8601 / UTC**. Booleans `true`/`false`.

## Communication

- Queue jobs/events **dot.case** (`rfq.submitted`, `email.send`), typed payloads.
- **Structured JSON logging** with levels + correlation id.

## Process (non-negotiable)

- **All DB access via `server/repositories`** — never import Prisma in components or route handlers.
- **All user-facing strings via next-intl** — no hard-coded copy (NFR5). Missing TR/RU → EN fallback with a "shown in English" marker.
- **zod at all boundaries** (forms + API); the server is authoritative.
- **Every list/query defines loading + empty + error states** (satisfies FR16 / FR17a).
- Central error handler; never leak internals server→client.
- Auth.js session; `/[locale]/admin` protected via `src/proxy.ts` (Next 16.2 renamed `middleware` → `proxy`) + per-mutation server-side auth checks.
- **Cache-tag convention** for `revalidateTag`: `product:{id}`, `catalog`, `projects`, `industry:{slug}`, `manufacturer:{id}`.
- **No price** field is ever exposed in any public page/source/API response.
- Documents are **ungated** (no form/login) and **versioned** with stable URLs.
- RFQ is **persist-first** → enqueue → email (an email failure must never lose a lead).

## Enforcement

TypeScript `strict`; ESLint + Prettier; CI runs **lint + typecheck + tests**. Test stack: **Vitest** (unit, co-located) + **Playwright** (e2e).

### Anti-patterns to reject in review

Hard-coded user-facing strings · snake_case in API JSON · business logic in React components (belongs in `server/`) · mutations without zod validation · **Prisma accessed outside `server/repositories`** · any price/cart/checkout affordance · lead-gating documents.

---

@AGENTS.md
