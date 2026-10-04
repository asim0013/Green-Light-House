# Data residency — the leads store (Story 5.3, FR47)

GREENLIGHTHOUSE keeps exactly one kind of personal data: **RFQ submissions** (the
`leads` table — company, name, email, phone, country, the inquiry text, consent
record, attachment metadata). Everything else is catalog/content with no residency
constraint.

`Lead` is relationally isolated (no foreign key to or from the catalog), so it can
live in a **different Postgres database — in a different region — from everything
else**. That is a deploy setting, not a code change.

> ⛔ **Which region the law requires is a legal decision, not an engineering one.**
> Whether Russian-citizen personal data must be stored in Russia (152-FZ), and with
> which provider, is an owner/legal determination — tracked in
> `owner-actions.md` §0-D (OQ7). This document only explains how to apply it.

## How it works

| Setting | Effect |
|---|---|
| `LEADS_DATABASE_URL` empty/unset (default) | The leads store **is** `DATABASE_URL`. One database, exactly as before Story 5.3. |
| `LEADS_DATABASE_URL` = another Postgres | Every lead read and write, the `lead_reference_seq` draws (real **and** honeypot references), the admin lead pipeline, the lead CSV export, the full backup export, and `npm run queue:*` all use that database. The catalog stays on `DATABASE_URL`. |

In code this is `leadsDb` (`src/lib/db.ts`), resolved by
`src/lib/leads-db-url.ts`. `src/lib/lead-routing.test.ts` fails the build if any
code reaches `Lead` through the catalog client, and
`src/server/repositories/lead-residency.integration.test.ts` proves the split
against a real second database.

## Turning it on (deploy runbook)

1. **Provision** a PostgreSQL 17 database in the required region. Note its URL.
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
   worker reads and updates leads when it sends notification emails). In docker
   compose the value must be reachable from inside the containers.
4. **Restart** both. It is read at runtime — no rebuild.
5. **Verify**: submit one RFQ; the row must appear in the leads database and NOT the
   main one:

   ```sql
   -- on the leads database: 1 row; on the main database: 0 rows
   SELECT reference, created_at FROM leads ORDER BY created_at DESC LIMIT 1;
   ```

## Moving existing leads (only if leads already exist in the main database)

Switching the setting does **not** move rows. Before flipping it on a live site:
put the site in maintenance (or stop the app + worker), copy the `leads` rows and
the current `lead_reference_seq` value to the leads database
(`pg_dump --data-only -t leads` + `SELECT setval('lead_reference_seq', <value>)`),
verify counts match, flip the setting, restart, then delete the rows from the main
database once verified. Copy the sequence value **first and exactly** — a lower
value in the new database would re-issue references buyers have already been given.

## Backups

With the stores split there are **two** databases to back up and restore. Story 5.6
(backup/DR) must cover both; the in-app full export (`/admin/settings/export`)
already reads leads from the leads store.

## Reverting

Unset `LEADS_DATABASE_URL` and restart — but only after moving the leads back
(same procedure, reversed). Unsetting alone would make the site read and write the
(empty) `leads` table in the main database.
