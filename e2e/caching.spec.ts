import { test, expect, request as apiRequest, type APIRequestContext } from "@playwright/test";
import { slaTextFor } from "../scripts/sla-fixtures";

/**
 * Story 1.8 — the live-publish caching contract, end to end.
 *
 * This is the story's real deliverable. It proves BOTH halves, and the first half
 * is the one that matters:
 *
 *   1. the page really is CACHED — after the database changes behind the app's
 *      back, the page still serves the OLD value
 *   2. `revalidateTag` really does INVALIDATE — after the endpoint is called, the
 *      page serves the NEW value
 *
 * Without step 1 this test passes just as happily when caching is switched off
 * entirely, which is precisely the failure mode Story 1.7's review found (a suite
 * whose green signal was anti-correlated with correctness).
 *
 * RUNS AGAINST A PRODUCTION BUILD, not `next dev`. The original reason given here
 * — "dev does not engage the cache handler at all" — was WRONG, and the Story 1.8
 * code review disproved it twice: `next dev` hangs when Redis is stopped (so it
 * calls `get`), and a dev-mode `test:e2e` run against an emptied Redis left 12
 * `glh:cache:*` keys behind (so it calls `set`). The "0 new keys" reading that
 * produced the claim was confounded — dev rewrites the SAME keys, so a count taken
 * against a non-empty Redis shows no delta.
 *
 * The separate config is still correct, for the reasons that actually hold: this
 * suite must exercise the server as deployed (production build, `next start`), it
 * mutates shared seeded rows so it cannot run in parallel with anything, and it
 * needs a port of its own. See `playwright.caching.config.ts`.
 *
 * Serial: it mutates shared seeded rows.
 */

test.describe.configure({ mode: "serial" });

// Prefer an explicitly-provided secret (CI sets one at job level); otherwise read
// the developer's own `.env`, which is what the server under test also reads.
// It must NOT be a hardcoded literal: `.env.example` now ships a change-me
// placeholder, so a default baked in here would silently disagree with any real
// deployment and turn a config error into a confusing 401.
if (!process.env.REVALIDATE_SECRET) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // No .env file — CI supplies the value directly.
  }
}
const SECRET = process.env.REVALIDATE_SECRET ?? "";

/** A seeded, EN-only industry name that appears on the homepage. */
const ORIGINAL = "Nuclear";
const PROBE = "ZZZ-CACHE-PROBE";

/** Direct Postgres access — deliberately bypassing the app under test. */
async function withPrisma<T>(fn: (db: PrismaLike) => Promise<T>): Promise<T> {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // ambient env
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient() as unknown as PrismaLike;
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

interface PrismaLike {
  industryTranslation: {
    updateMany(args: {
      where: { locale: "en"; name: string };
      data: { name: string };
    }): Promise<{ count: number }>;
  };
  // Story 3.5 — the SLA singleton. Hand-written like the row type above, and for
  // the same reason; ⚠️ the 3.4 review found that omitting a column HERE is why
  // no e2e could have asserted it. Both shapes below are matched on their CURRENT
  // value rather than by id, so the probe swap and its restore are symmetrical.
  slaProcessTranslation: {
    updateMany(args: {
      where: { locale: "en"; summary: string };
      data: { summary: string };
    }): Promise<{ count: number }>;
  };
  slaStepTranslation: {
    updateMany(args: {
      where: { locale: "en"; title: string };
      data: { title: string };
    }): Promise<{ count: number }>;
  };
  $disconnect(): Promise<void>;
}

async function renameIndustry(from: string, to: string): Promise<number> {
  return withPrisma(async (db) => {
    const { count } = await db.industryTranslation.updateMany({
      where: { locale: "en", name: from },
      data: { name: to },
    });
    return count;
  });
}

async function revalidate(request: APIRequestContext, tags: string[], secret = SECRET) {
  return request.post("/api/revalidate", {
    headers: { "content-type": "application/json", "x-revalidate-secret": secret },
    data: { tags },
  });
}

test.afterAll(async () => {
  // Safety net: never leave the shared seed mutated, even if an assertion threw.
  const restored = {
    industry: await renameIndustry(PROBE, ORIGINAL).catch(() => -1),
    // ⚠️ The SLA rows are a SINGLETON — there is one process row site-wide, on
    // NINE surfaces since Story 3.8. A probe left in place would not look like a stale test
    // fixture, it would be the live copy on every public page.
    summary: await setSlaSummary(SLA_SUMMARY_PROBE, SLA_SUMMARY).catch(() => -1),
    step: await setSlaStepTitle(SLA_STEP_PROBE, SLA_STEP_TITLE).catch(() => -1),
  };

  // ⚠️ RESTORING POSTGRES IS ONLY HALF OF IT, AND THE MISSING HALF WAS THE
  // DANGEROUS ONE. Every read here is cached in Redis under `TAGS.sla`, so a run
  // that aborted between the probe write and the restore left the PROBE STRING
  // being served from cache to real page loads — on all NINE SLA surfaces —
  // until something else happened to invalidate the tag. Rolling the database
  // back does not touch the cache. Purge it explicitly, from a request context of
  // our own (the `request` fixture is test-scoped and unavailable in afterAll).
  const port = 3101; // playwright.caching.config.ts — `next start -p 3101`
  const api = await apiRequest.newContext({ baseURL: `http://localhost:${port}` });
  try {
    await api.post("/api/revalidate", {
      headers: { "content-type": "application/json", "x-revalidate-secret": SECRET },
      data: { tags: ["sla", "industries"] },
    });
  } catch {
    // The server is already down on a normal clean exit; the database is what
    // outlives the run, and it has been restored above.
  } finally {
    await api.dispose();
  }

  // Loud, not silent: a swallowed restore failure is how a singleton stays
  // broken for every suite that runs after this one.
  for (const [what, count] of Object.entries(restored)) {
    if (count === -1) console.error(`[caching.spec] RESTORE FAILED for ${what} — check the seed`);
  }
});

test("serves STALE data until the tag is revalidated, then serves fresh (FR5/FR40)", async ({
  page,
  request,
}) => {
  // Every assertion is phrased in terms of PROBE, which is a unique string that
  // occurs nowhere else on the page. ORIGINAL cannot be used for absence checks:
  // "Nuclear" also appears inside the credibility band's "nuclear-grade QA
  // discipline", so `getByText(ORIGINAL)` is ambiguous and an assertion built on
  // it can be satisfied by the wrong element.

  // Warm the cache; the probe value is not in the database yet.
  await page.goto("/en");
  await expect(page.getByText(ORIGINAL, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(PROBE)).toHaveCount(0);

  // Change the database behind the app's back — no revalidation yet.
  expect(await renameIndustry(ORIGINAL, PROBE)).toBe(1);

  // ── THE LOAD-BEARING ASSERTION ──────────────────────────────────────────────
  // The row now says PROBE in Postgres. If the page is NOT cached, the reload
  // below shows it and this fails. Everything after here is meaningless without
  // this line.
  await page.reload();
  await expect(page.getByText(PROBE)).toHaveCount(0);

  // Publish: invalidate the tag that covers industry reads.
  const res = await revalidate(request, ["industries"]);
  expect(res.status()).toBe(200);
  expect((await res.json()).revalidated).toEqual(["industries"]);

  // ...and the change is live, with no redeploy.
  await page.reload();
  await expect(page.getByText(PROBE).first()).toBeVisible();

  // Restore, and confirm the restore is itself live (proving invalidation is
  // repeatable, not a one-shot).
  expect(await renameIndustry(PROBE, ORIGINAL)).toBe(1);
  expect((await revalidate(request, ["industries"])).status()).toBe(200);
  await page.reload();
  await expect(page.getByText(PROBE)).toHaveCount(0);
  await expect(page.getByText(ORIGINAL, { exact: true }).first()).toBeVisible();
});

test("THIS run writes cache entries into Redis, not into process memory (AC1)", async ({
  page,
  request,
}) => {
  // A restart inside Playwright is impractical, so this asserts the property that
  // restart-survival actually depends on: entries are in an external store.
  //
  // It must assert that *this run* wrote them. The earlier version scanned the
  // whole `glh:cache:*` keyspace and asserted `length > 0`, which entries from any
  // run in the previous 24 hours satisfy (that is the entry TTL) — so on a
  // developer machine it could not fail even if the handler wrote nothing at all.
  // Invalidating first forces the next render to MISS, so a passing assertion
  // requires a genuine write.
  const { createClient } = await import("redis");
  const client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  client.on("error", () => {});
  await client.connect();
  try {
    const before = Date.now();
    const purge = await revalidate(request, [
      "industries",
      "categories",
      "manufacturers",
      "projects",
    ]);
    expect(purge.status()).toBe(200);

    await page.goto("/en");

    // The homepage issues four cached reads, all four just invalidated, so a
    // working handler must have re-written them during this navigation.
    await expect
      .poll(
        async () => {
          let fresh = 0;
          for await (const key of client.scanIterator({ MATCH: "glh:cache:*", COUNT: 100 })) {
            for (const k of Array.isArray(key) ? key : [key]) {
              const raw = await client.get(k);
              if (raw && Number(JSON.parse(raw).lastModified ?? 0) >= before) fresh += 1;
            }
          }
          return fresh;
        },
        { timeout: 10_000, message: "no cache entry was written to Redis by this run" },
      )
      .toBeGreaterThan(0);
  } finally {
    await client.destroy();
  }
});

test("cache keys are per-locale — /tr never serves /en's cached text", async ({ page }) => {
  // The highest-consequence bug this story could ship: if `locale` were missing
  // from the cache key, whichever locale warmed the cache first would be served to
  // all three. It has to be proven HERE rather than in the main suite, because
  // that suite runs against `next dev`, which does not cache at all — the bug
  // would be invisible there.
  // Assert on DATABASE-derived text, not UI strings: next-intl messages are not
  // cached by `cached()`, so a headline like "Built for your sector" would differ
  // per locale even with a broken cache key — a vacuous assertion. The seeded
  // `oil-gas` industry has a real name in all three locales, so it only differs
  // here if the cached repository read is keyed per locale.
  await page.goto("/en");
  await expect(page.getByText("Oil & Gas", { exact: true }).first()).toBeVisible();

  await page.goto("/tr");
  await expect(page.getByText("Petrol ve Gaz", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Oil & Gas", { exact: true })).toHaveCount(0);

  await page.goto("/ru");
  await expect(page.getByText("Нефть и газ", { exact: true }).first()).toBeVisible();

  // ...and back, to prove the first locale's entry was not evicted by the others.
  await page.goto("/en");
  await expect(page.getByText("Oil & Gas", { exact: true }).first()).toBeVisible();
});

test("revalidation endpoint rejects unauthenticated and malformed calls", async ({ request }) => {
  // Wrong secret.
  expect((await revalidate(request, ["industries"], "wrong-secret")).status()).toBe(401);

  // Missing header entirely.
  const noHeader = await request.post("/api/revalidate", {
    headers: { "content-type": "application/json" },
    data: { tags: ["industries"] },
  });
  expect(noHeader.status()).toBe(401);

  // Authenticated but invalid body → 422, not a silent success.
  const badBody = await request.post("/api/revalidate", {
    headers: { "content-type": "application/json", "x-revalidate-secret": SECRET },
    data: { tags: [] },
  });
  expect(badBody.status()).toBe(422);

  // Authenticated but an unrecognised tag → refused rather than forwarded.
  const unknownTag = await revalidate(request, ["definitely-not-a-tag"]);
  expect(unknownTag.status()).toBe(422);
  expect((await unknownTag.json()).error.code).toBe("unknown_tag");
});

/**
 * Story 3.5 — the SLA copy, and the eight NAVIGABLE surfaces it publishes to.
 *
 * ⚠️ THE SEEDED COPY IS IMPORTED, NEVER RETYPED. `e2e/` is inside the AC5
 * hygiene gate sweep, so a literal sentence here would be a second source of the
 * copy and the gate would (correctly) fail on it. `slaTextFor` reads the same
 * module `prisma/seed.ts` writes into the database.
 */
const SLA_SUMMARY = slaTextFor("en").summary;
const SLA_STEP_TITLE = slaTextFor("en").steps[0].title;
const SLA_SUMMARY_PROBE = "ZZZ-SLA-SUMMARY-PROBE";
const SLA_STEP_PROBE = "ZZZ-SLA-STEP-PROBE";

/**
 * The SEVEN surfaces that draw the one-line SUMMARY, one per mounting page type.
 *
 * `/en/contact` joined them in Story 3.8. ⚠️ Adding it here is not optional: the
 * test would have stayed GREEN while never checking the new surface, which is
 * the silent hole this list exists to prevent.
 *
 * `/industries/[slug]` appears once but mounts TWO consumers (the hero and the
 * closing band) — the reason the read is wrapped in React `cache()`.
 */
const SLA_SUMMARY_PAGES = [
  "/en",
  "/en/contact",
  "/en/industries/fire-safety",
  "/en/products/fd-9500",
  "/en/services",
  "/en/projects",
  "/en/projects/hospital-fire-suppression",
];

/** The eighth: the only navigable surface that draws the STEPPER. */
const SLA_STEPPER_PAGE = "/en/rfq";

async function setSlaSummary(from: string, to: string): Promise<number> {
  return withPrisma(async (db) => {
    const { count } = await db.slaProcessTranslation.updateMany({
      where: { locale: "en", summary: from },
      data: { summary: to },
    });
    return count;
  });
}

async function setSlaStepTitle(from: string, to: string): Promise<number> {
  return withPrisma(async (db) => {
    const { count } = await db.slaStepTranslation.updateMany({
      where: { locale: "en", title: from },
      data: { title: to },
    });
    return count;
  });
}

test("one SLA edit publishes to all eight navigable surfaces, warm cache, no redeploy (Story 3.5 AC6)", async ({
  page,
  request,
}) => {
  // FR30's deploy-free half, end to end. The SLA is the one piece of content that
  // renders on EVERY public route, so this is also the widest blast radius any
  // single `revalidateTag` has in the app.
  //
  // ⚠️ THE NINTH SURFACE IS DELIBERATELY ABSENT. The submitted confirmation
  // mounts only after a successful POST, and this config declares NO
  // `globalTeardown` — a lead created here would escape the pollution gate the
  // main suite relies on. It is proven separately, by unit render, in
  // `src/components/rfq/RfqConfirmation.test.tsx`.

  // ── WARM THE CACHE ──────────────────────────────────────────────────────────
  // Nothing flushes Redis before this suite, so entries may already exist; these
  // navigations guarantee it either way, and assert the seeded copy is what is
  // being served before anything changes.
  for (const path of SLA_SUMMARY_PAGES) {
    await page.goto(path);
    await expect(
      page.getByText(SLA_SUMMARY).first(),
      `${path} does not show the SLA`,
    ).toBeVisible();
  }
  await page.goto(SLA_STEPPER_PAGE);
  await expect(page.getByText(SLA_STEP_TITLE).first()).toBeVisible();

  // Edit the content model behind the app back — no revalidation yet. This is
  // what a Story 4.8 admin save will do.
  expect(await setSlaSummary(SLA_SUMMARY, SLA_SUMMARY_PROBE)).toBe(1);
  expect(await setSlaStepTitle(SLA_STEP_TITLE, SLA_STEP_PROBE)).toBe(1);

  // ── THE LOAD-BEARING ASSERTIONS ─────────────────────────────────────────────
  // Postgres now says PROBE. If these pages are NOT cached, they show it here and
  // this fails. Everything after this block is meaningless without it: a suite
  // that only checked "the new text appears after revalidating" passes just as
  // happily with caching switched off entirely, which is the exact failure mode
  // the Story 1.7 review found.
  for (const path of SLA_SUMMARY_PAGES) {
    await page.goto(path);
    await expect(page.getByText(SLA_SUMMARY_PROBE), `${path} was NOT cached`).toHaveCount(0);
  }
  await page.goto(SLA_STEPPER_PAGE);
  await expect(page.getByText(SLA_STEP_PROBE), `${SLA_STEPPER_PAGE} was NOT cached`).toHaveCount(0);

  // ── PUBLISH ─────────────────────────────────────────────────────────────────
  // One tag. If it were not registered in `COLLECTION_TAGS` this is a 422
  // `unknown_tag` rather than a silent no-op — the endpoint refuses tags it does
  // not know, which is why the closed set in `cache-tags.test.ts` is worth having.
  const res = await revalidate(request, ["sla"]);
  expect(res.status()).toBe(200);
  expect((await res.json()).revalidated).toEqual(["sla"]);

  // ...and every surface is live, from ONE edit and ONE revalidate.
  for (const path of SLA_SUMMARY_PAGES) {
    await page.goto(path);
    await expect(
      page.getByText(SLA_SUMMARY_PROBE).first(),
      `${path} did not pick up the revalidated SLA`,
    ).toBeVisible();
  }
  await page.goto(SLA_STEPPER_PAGE);
  await expect(page.getByText(SLA_STEP_PROBE).first()).toBeVisible();

  // ── RESTORE, and prove the restore is itself live ───────────────────────────
  // Repeatable invalidation, not a one-shot — and it leaves the singleton exactly
  // as seeded, which matters more here than anywhere else in this file.
  expect(await setSlaSummary(SLA_SUMMARY_PROBE, SLA_SUMMARY)).toBe(1);
  expect(await setSlaStepTitle(SLA_STEP_PROBE, SLA_STEP_TITLE)).toBe(1);
  expect((await revalidate(request, ["sla"])).status()).toBe(200);

  for (const path of [...SLA_SUMMARY_PAGES, SLA_STEPPER_PAGE]) {
    await page.goto(path);
    await expect(page.getByText(SLA_SUMMARY_PROBE), `${path} still shows the probe`).toHaveCount(0);
    await expect(page.getByText(SLA_STEP_PROBE), `${path} still shows the probe`).toHaveCount(0);
  }
  await page.goto(SLA_SUMMARY_PAGES[0]);
  await expect(page.getByText(SLA_SUMMARY).first()).toBeVisible();
});
