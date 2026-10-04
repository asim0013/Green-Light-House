/**
 * Where the leads / personal-data store lives (Story 5.3 — FR47, Decision 3).
 *
 * `Lead` is the ONLY personal-data model (name, email, phone, company, country +
 * the RFQ free text) and it is relationally ISOLATED — no FK to the catalog, none
 * from it — so it can live in a different Postgres from everything else. That is
 * the whole residency mechanism: set `LEADS_DATABASE_URL` to a Postgres in the
 * region the law requires (e.g. RU, under 152-FZ) and every Lead read, write,
 * sequence draw and backup goes there. No code change.
 *
 * Unset, empty or whitespace ⇒ the leads store IS the main `DATABASE_URL` — exactly
 * the single-database behaviour that existed before this story.
 *
 * ⚠️ WHICH region is required is a LEGAL determination (owner action, 152-FZ),
 * never decided here. This module only makes it a deploy setting.
 *
 * PURE — no Prisma import — so `src/lib/db.ts`, the ops scripts and the e2e
 * harness all resolve the URL the same way.
 */
type Env = Record<string, string | undefined>;

/** The connection URL for the leads store. Empty/whitespace falls back too. */
export function resolveLeadsDatabaseUrl(env: Env = process.env): string | undefined {
  const leads = env.LEADS_DATABASE_URL?.trim();
  return leads ? leads : env.DATABASE_URL;
}

/** True only when the leads store is configured as a DIFFERENT database from the main one. */
export function leadsStoreIsSeparate(env: Env = process.env): boolean {
  const leads = env.LEADS_DATABASE_URL?.trim();
  return !!leads && leads !== env.DATABASE_URL?.trim();
}
