# Data residency — the leads store (Story 5.3, FR47)

The personal data GREENLIGHTHOUSE stores about **buyers** is the **RFQ submission**
(the `leads` table — company, name, email, phone, country, the inquiry text, consent
record, attachment metadata). The only other personal data in the database is the
staff admin account (`AdminUser` — the admin's email and password-reset token
hashes); it is not buyer data and stays with the catalog. Everything else is
catalog/content with no residency constraint.

`Lead` is relationally isolated (no foreign key to or from the catalog), so its
table can live in a **different Postgres database — in a different region — from
everything else**. That is a deploy setting, not a code change.

> ⛔ **Which region the law requires is a legal decision, not an engineering one.**
> Whether Russian-citizen personal data must be stored in Russia (152-FZ), and with
> which provider, is an owner/legal determination — tracked in
> `owner-actions.md` §0-D (OQ7). This document only explains how to apply it.

## What this does NOT cover — read before telling anyone "the data is in region X"

`LEADS_DATABASE_URL` moves the **database rows**. Three other things a buyer's
inquiry touches do **not** move with it, and legal must weigh each:

1. **Attachment files.** `leads.attachment_key` points at an object in the ONE
   shared S3-compatible bucket (`S3_*` settings, `src/lib/storage.ts`). There is no
   separate leads bucket; moving attachments to the leads region would need a code
   change (a `LEADS_S3_*` client). Logged in `deferred-work.md`.
2. **Notification email.** The "new RFQ" email (`src/server/rfq/notify.ts`) carries
   the buyer's name, company, email, phone, country and inquiry text to the email
   provider and to the `RFQ_NOTIFY_TO` mailbox — wherever those are hosted. The
   buyer's confirmation email goes to the buyer.
3. **Processing.** The RFQ is received and validated by the app server wherever it
   runs; only *storage at rest* moves.

## How it works

| Setting | Effect |
|---|---|
| `LEADS_DATABASE_URL` empty/unset (default) | The leads store **is** `DATABASE_URL`. One database, exactly as before Story 5.3. |
| `LEADS_DATABASE_URL` = another Postgres | Every lead read and write, the `lead_reference_seq` draws (real **and** honeypot references), the admin lead pipeline, the lead CSV export, the full backup export, and `npm run queue:*` all use that database. The catalog stays on `DATABASE_URL`. |

In code this is `leadsDb` (`src/lib/db.ts`), resolved by
`src/lib/leads-db-url.ts`. Routing is guarded in two layers: the catalog client
`prisma` is **typed without `lead`**, so any direct TypeScript route to the Lead
model through it is a compile error; and `src/lib/lead-routing.test.ts` covers what
types cannot see (plain JS files, raw SQL on `leads` / the sequence, `$transaction`
callbacks). `src/server/repositories/lead-residency.integration.test.ts` proves the
split against a real second database. These are strong guards, not a proof: a
determined bypass (e.g. an `as any` cast) is still possible — code review remains
part of the control.

## Turning it on (deploy runbook)

1. **Provision** a PostgreSQL 17 database in the required region. It must allow
   **`CREATE EXTENSION pg_trgm`** (migration `20260822153001_search_trgm` runs it):
   on a managed Postgres, check the extension is available and the migrating role
   may create it — otherwise `migrate deploy` fails on that step.
2. **Migrate it** — the leads database needs the **full schema** (the `leads` table
   *and* the `lead_reference_seq` sequence the references are drawn from). Run the
   SAME migrations against both databases:

   ```bash
   DATABASE_URL="<main url>"  npx prisma migrate deploy
   DATABASE_URL="<leads url>" npx prisma migrate deploy
   ```

   (Every future release must do both. The catalog tables in the leads database stay
   empty and unused; the `leads` table in the main database stays empty and unused.
   Deliberately simple: one schema, one migrations folder, nothing to drift.)
3. **Set** `LEADS_DATABASE_URL=<leads url>` for the **app AND the worker** (the
   worker reads and updates leads when it sends notification emails).
   - It must be reachable **from where each process runs**. In docker compose that
     means a container-reachable host — never the `localhost` URL from the host's
     `.env`.
   - ⚠️ **Compose trap:** the `worker` service overrides `DATABASE_URL` to
     `postgres:5432`, but `.env` (shared via `env_file`) still holds the host-style
     `localhost` URL. If you set `LEADS_DATABASE_URL` to that same localhost string
     "to keep one database", the worker sees two DIFFERENT strings, treats the
     stores as separate, and connects to `localhost` inside the container — which
     fails. For a single database, leave `LEADS_DATABASE_URL` **empty**.
4. **Restart** both. It is read at runtime — no rebuild.
5. **Verify**: submit one RFQ; the row must appear in the leads database and NOT the
   main one:

   ```sql
   -- on the leads database: 1 row; on the main database: 0 rows
   SELECT reference, created_at FROM leads ORDER BY created_at DESC LIMIT 1;
   ```

## Moving existing leads (only if leads already exist in the main database)

Switching the setting does **not** move rows. On a live site:

1. Stop the app and worker (or put the site in maintenance) so no reference is drawn
   mid-move.
2. Copy the rows: `pg_dump --data-only -t leads "<main url>" | psql "<leads url>"`.

   ⚠️ **Strip `?schema=public` first.** The app's URLs carry Prisma's `?schema=…`
   query parameter (see `.env.example`); `pg_dump` and `psql` (libpq) reject it with
   `invalid URI query parameter: "schema"`. For these tools use the same URL
   without it — e.g. `postgresql://glh:…@host:5432/greenlighthouse`. The same
   applies to running the `SELECT`/`setval` statements below with `psql`.
3. Copy the sequence **exactly**, including `is_called`. On the MAIN database:

   ```sql
   SELECT last_value, is_called FROM lead_reference_seq;
   ```

   then on the LEADS database, with those two values:

   ```sql
   SELECT setval('lead_reference_seq', <last_value>, <is_called>);
   ```

   ⚠️ Skipping this is not cosmetic: a freshly migrated sequence restarts at 2000,
   so the next RFQ is issued `GLH-RFQ-2000` — a reference that already exists — and
   fails with a unique-constraint 500 (verified in review). Using `setval` without
   `is_called` would also skip one value when the sequence has never been called.
4. Verify the row counts match, set `LEADS_DATABASE_URL`, restart, run the step-5
   check above, then delete the rows from the main database.

## Backups

With the stores split there are **two** databases to back up and restore (and the
leads database's `lead_reference_seq` value must survive a restore — a lower value
would re-issue references buyers already hold). Story 5.6 (backup/DR) must cover
both; the in-app full export (`/admin/settings/export`) already reads leads from the
leads store.

## Reverting

Unset `LEADS_DATABASE_URL` and restart — but only after moving the leads back
(same procedure, reversed, including the sequence). Unsetting alone would make the
site read and write the (empty) `leads` table in the main database.
