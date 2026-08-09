import { test, expect, type APIRequestContext } from "@playwright/test";

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
 * RUNS AGAINST A PRODUCTION BUILD, not `next dev` — verified empirically that dev
 * does not engage the cache handler at all (0 Redis keys after a dev request vs 4
 * after a production one). See `playwright.caching.config.ts`.
 *
 * Serial: it mutates shared seeded rows.
 */

test.describe.configure({ mode: "serial" });

const SECRET = process.env.REVALIDATE_SECRET ?? "dev-revalidate-secret";

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
  await renameIndustry(PROBE, ORIGINAL).catch(() => 0);
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

test("cache entries live in Redis, not in process memory (AC1)", async ({ page }) => {
  // A restart inside Playwright is impractical, so this asserts the property that
  // restart-survival actually depends on: the entries are in an external store.
  // `cacheMaxMemorySize: 0` disables the in-process layer, so a hit can only come
  // from Redis.
  await page.goto("/en");

  const { createClient } = await import("redis");
  const client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  client.on("error", () => {});
  await client.connect();
  try {
    const keys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: "glh:cache:*", COUNT: 100 })) {
      keys.push(...(Array.isArray(key) ? key : [key]));
    }
    // The homepage issues four cached reads (projects, industries, categories,
    // manufacturers), so an empty set means caching never engaged.
    expect(keys.length).toBeGreaterThan(0);
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
