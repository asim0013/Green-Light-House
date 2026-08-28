import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";
import { probeClamavReady } from "./clamavReady";
import { storageKeyExists, listStorageKeys, deleteStorageKey } from "./storageReady";
import { cleanPdf, eicarPdf, plainZip } from "../scripts/attachment-fixtures";

/**
 * Story 3.2 — the RFQ form and its persist-first write path, end to end.
 *
 * THE KEYSTONE (AC12c): fill the form in a real browser, submit, read the
 * DB-minted reference off the confirmation, then `findUnique` the row by it in
 * Postgres and assert the fixture's fields — the UI shows the PERSISTED value,
 * not a client-side rendering of something else.
 *
 * Mechanics inherited from the standing suite:
 * - `probeDbReady` probes the ENVIRONMENT, never the surface (a broken page can
 *   never buy itself a skip). In CI the skip path is CLOSED: CI provisions
 *   Postgres, so an unreachable DB there is a defect, not an environment.
 * - `withPrisma` is the caching-spec's sanctioned e2e→Postgres shape (own lazy
 *   client + loadEnvFile, never `@/lib/db`).
 * - e2e leads use the DISTINCT `zzz-e2e-lead-` email prefix — the integration
 *   suite's `zzz-int-test-lead-` cleanup must never mop e2e leftovers
 *   invisibly. Cleanup in `afterAll` is scoped PER WORKER (`w<n>-` in the
 *   email), because a whole-prefix deleteMany there races the other workers
 *   under fullyParallel — proven live, see the afterAll. Every test mints a
 *   UNIQUE suffix so parallel tests never share a row.
 * - No storage probe: nothing here touches MinIO, and an unneeded probe is a
 *   skip vector (2.3's lesson).
 *
 * Sequence-gap disclosure: these runs advance `lead_reference_seq` permanently
 * (deleteMany does not roll a sequence back). That is by design — gaps are
 * doctrine (schema.prisma) — so `last_value` ≫ row-count is never a leak.
 *
 * NEVER asserted here, deliberately: a literal reference value, digit count
 * (breaks at 10000 — the exact lpad outage 3.0 removed), sequence contiguity,
 * or whole-table `count(*)` deltas (parallel workers race).
 */

const E2E_EMAIL_PREFIX = "zzz-e2e-lead-";

interface PrismaLike {
  lead: {
    findUnique(args: { where: { reference: string } }): Promise<{
      email: string;
      name: string;
      company: string;
      industry: string | null;
      timeline: string | null;
      quantities: string | null;
      projectDetails: string | null;
      equipment: unknown;
      locale: string | null;
      consent: boolean;
      consentAt: Date | null;
      consentVersion: string | null;
      source: string;
      // Story 3.4's other attribution column. Added by that story's REVIEW: the
      // story shipped `prefillContext` with no test that it ever reached
      // Postgres, and this hand-written row type is why — it silently omitted
      // the column, so no e2e could have asserted it.
      prefillContext: unknown;
      reference: string;
      attachmentKey: string | null;
      attachmentName: string | null;
      attachmentMime: string | null;
      attachmentSizeBytes: number | null;
      attachmentScanStatus: string | null;
      attachmentScannedAt: Date | null;
    } | null>;
    count(args: { where: { email: string } }): Promise<number>;
    deleteMany(args: { where: { email: { startsWith: string } } }): Promise<{ count: number }>;
  };
  $disconnect(): Promise<void>;
}

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

let emailSeq = 0;

function uniqueEmail(workerIndex: number): string {
  // Worker + PID so the per-worker afterAll can clean by prefix without ever
  // touching a CONCURRENT invocation of this suite (3.2 review: `w<n>-` alone
  // is identical for worker n of any two simultaneous runs). The SEQUENCE is
  // what makes it unique WITHIN a worker: `Date.now()` alone collides for two
  // calls in the same millisecond, which silently aliased two leads in one
  // test (caught by the 3.7a review's bracket proof).
  emailSeq += 1;
  return `${E2E_EMAIL_PREFIX}w${workerIndex}-p${process.pid}-${Date.now()}-${emailSeq}@example.com`;
}

/**
 * Read the limiter's minted keys (Story 3.7a review — the socket-fill proof).
 * Bounded client, the cache-flush.mjs recipe: node-redis's default reconnect
 * never settles against a dead target. Returns [] when Redis is unreachable
 * so the caller's assertion, not a connection error, is what fails.
 */
async function scanRateLimitKeys(): Promise<string[]> {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // ambient env
  }
  const url = process.env.REDIS_URL?.trim();
  if (!url) return [];
  const { createClient } = await import("redis");
  const redis = createClient({ url, socket: { connectTimeout: 3000, reconnectStrategy: false } });
  redis.on("error", () => {});
  try {
    await redis.connect();
    const keys: string[] = [];
    for await (const batch of redis.scanIterator({ MATCH: "rfq:rl:*", COUNT: 500 })) {
      keys.push(...(Array.isArray(batch) ? batch : [batch]));
    }
    return keys;
  } catch {
    return [];
  } finally {
    try {
      redis.destroy();
    } catch {
      // already closed
    }
  }
}

let ipSeq = 0;

/**
 * A globally-unique, `net.isIP`-valid client bucket for the rate limiter
 * (Story 3.7a). Next's server passes a client-sent `x-forwarded-for` through
 * UNTOUCHED in direct-connect, and the route's policy keys on the rightmost
 * entry — so every test that POSTs gets its OWN counter bucket, which is what
 * makes the suite order-independent, same-hour-rerun-proof and CI-retry-proof
 * (counters persist in Redis for 1h; the shared-socket bucket arithmetic
 * could not fit even one clean re-run).
 *
 * ⚠️ ALL FOUR VARYING GROUPS MUST BE IN THE FIRST FOUR (3.7a review): the
 * limiter buckets IPv6 by its /64 PREFIX, so anything after the fourth hextet
 * is truncated away — an earlier version varied groups 5-6 and every test in a
 * worker silently collapsed into ONE bucket. Documentation range
 * (2001:db8::/32) with pid+worker+seq packed into hextets 3 and 4.
 */
function fakeClientIp(workerIndex: number): string {
  ipSeq += 1;
  const third = (process.pid % 0xffff).toString(16);
  const fourth = (((workerIndex + 1) * 0x100 + (ipSeq % 0x100)) % 0xffff).toString(16);
  return `2001:db8:${third}:${fourth}::1`;
}

let dbReady = true;
let clamavReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  clamavReady = await probeClamavReady();
  if (process.env.CI) {
    expect(
      dbReady,
      "CI provisions Postgres — an unreachable DB here is a defect, not an environment",
    ).toBe(true);
    // Story 3.7b: `ci.yml` provisions a clamav service container, so the
    // skip path is CLOSED here exactly as it is for Postgres. A
    // malware-detection test that skips in the merge gate is
    // indistinguishable from one that passes (Story 2.3's lesson).
    expect(
      clamavReady,
      "CI provisions ClamAV — an unreachable scanner here is a defect, not an environment",
    ).toBe(true);
  }
  await warmUp(baseURL, ["/en/rfq", "/en/privacy", "/tr/rfq"]);
});

test.afterAll(async ({}, testInfo) => {
  if (!dbReady) return;
  // Scoped to THIS worker's rows IN THIS PROCESS. Under fullyParallel the
  // file's afterAll runs once per worker, and a whole-prefix deleteMany here
  // raced the other workers — proven live in the first full-suite run: worker
  // A's cleanup deleted worker B's row between B's submit and B's
  // count-by-email, turning an expected 1 into 0. The whole-prefix sweep is
  // `e2e/global-teardown.ts` — the post-suite pollution gate, where nothing
  // is in flight.
  await withPrisma((db) =>
    db.lead.deleteMany({
      where: {
        email: { startsWith: `${E2E_EMAIL_PREFIX}w${testInfo.workerIndex}-p${process.pid}-` },
      },
    }),
  );
});

/**
 * Open /en/rfq and WAIT FOR HYDRATION before touching any control.
 *
 * The race is real and was caught live, not hypothesized: a `selectOption`
 * issued before React hydrates is UNDONE at mount — react-hook-form applies its
 * defaultValues to the field refs when `register` attaches, flipping the select
 * back to "" — and the submission then honestly carries no industry (the first
 * keystone run persisted `industry: null` while the later-typed fields
 * survived). The barrier: React 19 stamps hydrated DOM nodes with a
 * `__reactProps$…` key, and the form's appears exactly when its onSubmit is
 * live.
 */
async function openRfq(page: import("@playwright/test").Page) {
  await page.goto("/en/rfq");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
  });
}

/** Fill the minimum valid form. Fields are located by LABEL/ROLE only — the
 *  honeypot is aria-hidden + tabindex=-1 and unreachable that way BY
 *  CONSTRUCTION, which is itself half the anatomy proof. */
async function fillMinimalForm(page: import("@playwright/test").Page, email: string) {
  await page.getByLabel("Full name").fill("Elena Petrova");
  await page.getByLabel("Company").fill("Enka EPC");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("checkbox").check();
}

test.describe("persist-first submission (AC7, AC12c)", () => {
  test("KEYSTONE: submit → confirmation echoes the DB row's reference → row asserted in Postgres", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    // Own limiter bucket (3.7a): consuming POSTs must never share the socket bucket.
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    await openRfq(page);
    await page.getByLabel("Industry").selectOption("fire-safety");
    await page.getByLabel("Timeline").selectOption("1-3m");
    // Enter in the equipment input adds a chip — it must NOT submit the form.
    await page.getByLabel("Equipment").fill("20 t overhead crane");
    await page.getByLabel("Equipment").press("Enter");
    await expect(page.getByRole("button", { name: "Remove 20 t overhead crane" })).toBeVisible();
    await page.getByLabel("Quantities").fill("12 detectors, 2 panels");
    await page.getByLabel("Project description").fill("Hospital wing retrofit, EN 54 panels.");
    await fillMinimalForm(page, email);
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    // The confirmation, with focus on its heading (AC6's success half).
    const heading = page.getByRole("heading", { name: "Inquiry sent" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();

    // The reference: format only — never a literal value or a digit count.
    const referenceText = await page.getByText(/^GLH-RFQ-\d+$/).innerText();
    expect(referenceText).toMatch(/^GLH-RFQ-\d{4,}$/);

    // The row, by the reference THE SCREEN showed.
    const row = await withPrisma((db) =>
      db.lead.findUnique({ where: { reference: referenceText } }),
    );
    expect(row, `no lead row for on-screen reference ${referenceText}`).not.toBeNull();
    expect(row!.email).toBe(email);
    expect(row!.name).toBe("Elena Petrova");
    expect(row!.company).toBe("Enka EPC");
    expect(row!.industry).toBe("fire-safety");
    expect(row!.timeline).toBe("1-3m");
    expect(row!.quantities).toBe("12 detectors, 2 panels");
    expect(row!.projectDetails).toBe("Hospital wing retrofit, EN 54 panels.");
    expect(row!.equipment).toEqual([{ kind: "freeText", text: "20 t overhead crane" }]);
    expect(row!.locale).toBe("en");
    expect(row!.consent).toBe(true);
    expect(row!.consentAt).not.toBeNull();
    expect(row!.consentVersion).toBe("privacy-2026-08-stub-r3:en");
    // Task 0 #7: no pre-fill exists yet, so source is the DB default.
    expect(row!.source).toBe("direct");
  });

  test("reload after success: ONE row by email, and the empty form returns (disclosed AC7 behavior)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    // Own limiter bucket (3.7a): consuming POSTs must never share the socket bucket.
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    await openRfq(page);
    await fillMinimalForm(page, email);
    await page.getByRole("button", { name: "Send project inquiry" }).click();
    await expect(page.getByRole("heading", { name: "Inquiry sent" })).toBeVisible();

    // Counted BY EMAIL, never by reference: a by-reference count of a UNIQUE
    // column cannot exceed 1, so that assertion could never fail (AC12c).
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(1);

    // The confirmation is client state, so a reload returns the EMPTY form —
    // acceptable and disclosed (AC7). What this proves is the real bar: a
    // reload must not re-issue the POST. If someone later swaps the fetch for
    // a native form POST navigation, the reload replays it and this count
    // goes to 2.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inquiry sent" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Send project inquiry" })).toBeVisible();
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(1);
  });

  test("consent unchecked: CLIENT-side rejection, error announced on the checkbox, NO request issued", async ({
    page,
  }, testInfo) => {
    // Renamed in the 3.2 review: the first title claimed "422 path … AC4's
    // write barrier" for a flow that never leaves the browser — the resolver
    // rejects before fetch, so the old count-0 assertion was vacuous. The
    // write barrier's real proof is the direct-POST test below; THIS test's
    // claim is that no request fires at all.
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);

    let posts = 0;
    await page.route("**/api/rfq", (route) => {
      posts++;
      return route.continue();
    });

    await openRfq(page);
    await page.getByLabel("Full name").fill("Elena Petrova");
    await page.getByLabel("Company").fill("Enka EPC");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#rfq-consent-error")).toContainText("agree");
    // Entered input SURVIVES the failed submit (AC5)…
    await expect(page.getByLabel("Work email")).toHaveValue(email);
    // …and the rejection was client-side: zero POSTs crossed the wire.
    expect(posts).toBe(0);
  });

  test("a typed-but-unchipped equipment draft COMMITS at submit — never silently dropped", async ({
    page,
  }, testInfo) => {
    // 3.2 review: a buyer who types the one thing they need and clicks Send
    // without pressing Add used to submit equipment: [] with no trace.
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    // Own limiter bucket (3.7a REVIEW): this test genuinely reaches the
    // server — it was the consuming site the first bucket pass missed while
    // wiring the fully-intercepted persist-failure test instead.
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    await openRfq(page);
    await fillMinimalForm(page, email);
    await page.getByLabel("Equipment").fill("uncommitted crane");
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    await expect(page.getByRole("heading", { name: "Inquiry sent" })).toBeVisible();
    const referenceText = await page.getByText(/^GLH-RFQ-\d+$/).innerText();
    const row = await withPrisma((db) =>
      db.lead.findUnique({ where: { reference: referenceText } }),
    );
    expect(row!.equipment).toEqual([{ kind: "freeText", text: "uncommitted crane" }]);
  });
});

test.describe("persist failure (AC3/AC7's other half)", () => {
  test("a 500 from the endpoint keeps EVERY entered value on screen and says so", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    // Own limiter bucket (3.7a): consuming POSTs must never share the socket bucket.
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    // Postgres-down without touching Postgres: intercept the POST at the
    // network layer and answer with the route's real 500 envelope. The
    // intercept doubles as the HONEYPOT-CONTRACT proof (3.2 review): the
    // posted JSON must carry `website` — the server's honeypot check (Story
    // 3.7a, live) reads it off the raw parse, and dropping it from the
    // payload would blind the trap silently.
    let postedBody: Record<string, unknown> | null = null;
    await page.route("**/api/rfq", (route) => {
      postedBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "internal_error", message: "The inquiry could not be saved." },
        }),
      });
    });

    await openRfq(page);
    await fillMinimalForm(page, email);
    await page.getByLabel("Project description").fill("Survives the failure.");
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    // The failure is stated… (`.filter({hasText})`, because Next's own route
    // announcer is a second, empty role=alert — never `has:`-rooted locators.)
    await expect(page.getByRole("alert").filter({ hasText: "could not be sent" })).toContainText(
      "try again",
    );
    // …and NOTHING the buyer typed is lost — every filled field, not a sample
    // (3.2 review: the first version asserted 3 of the 5 and claimed "every").
    await expect(page.getByLabel("Full name")).toHaveValue("Elena Petrova");
    await expect(page.getByLabel("Company")).toHaveValue("Enka EPC");
    await expect(page.getByLabel("Work email")).toHaveValue(email);
    await expect(page.getByLabel("Project description")).toHaveValue("Survives the failure.");
    await expect(page.getByRole("checkbox")).toBeChecked();

    // The 3.7a honeypot contract, asserted on the wire.
    expect(postedBody).not.toBeNull();
    expect(postedBody!).toHaveProperty("website", "");
  });
});

test.describe("validation a11y wiring (AC6, AC12) — each check names what breaks it", () => {
  test("live region exists EMPTY at first render, fills on failed submit; focus lands on first invalid control", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await openRfq(page);

    // Mounted-before-news: the region is in the DOM while still empty. Breaks
    // if the region is rendered conditionally with its content (P5-proven at
    // the component level — the render test went red under that mutation).
    const status = page.getByRole("status");
    await expect(status).toBeAttached();
    await expect(status).toBeEmpty();

    await page.getByRole("button", { name: "Send project inquiry" }).click();

    // Fills on failure. Breaks if onInvalid stops announcing.
    await expect(status).toContainText("attention");

    // Focus-to-first-invalid: `name` is the first REQUIRED control in DOM (and
    // registration) order. Breaks if registration order diverges from DOM
    // order or shouldFocusError is disabled.
    await expect(page.getByLabel("Full name")).toBeFocused();

    // aria-describedby RESOLVES to the element carrying the visible message.
    // Breaks if the id wiring or the error element's id drifts.
    await expect(page.getByLabel("Full name")).toHaveAttribute(
      "aria-describedby",
      "rfq-name-error",
    );
    await expect(page.locator("#rfq-name-error")).toContainText("required");
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
  });

  test("BLUR triggers inline validation without a submit (mode: onBlur)", async ({
    page,
  }, testInfo) => {
    // 3.2 review: no test anywhere exercised the blur trigger — switching the
    // form to mode:'onSubmit' kept every suite green.
    if (!dbReady) testInfo.skip();
    await openRfq(page);

    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByLabel("Full name").focus(); // blur the email field
    await expect(page.locator("#rfq-email-error")).toContainText("valid work email");
    await expect(page.getByLabel("Work email")).toHaveAttribute("aria-invalid", "true");
  });

  test("chip REMOVE: focus lands on the add input, the removal is announced", async ({
    page,
  }, testInfo) => {
    // 3.2 review: nothing anywhere clicked a remove button — the remove/focus/
    // announce logic could be deleted with every suite green. This covers the
    // last-chip → add-input leg and the announcement; the multi-chip
    // next-button leg stays honestly unproven (see RfqForm.test.tsx's note).
    if (!dbReady) testInfo.skip();
    await openRfq(page);

    const equipmentInput = page.getByLabel("Equipment");
    await equipmentInput.fill("temporary crane");
    await equipmentInput.press("Enter");
    const removeButton = page.getByRole("button", { name: "Remove temporary crane" });
    await expect(removeButton).toBeVisible();

    await removeButton.click();
    await expect(removeButton).not.toBeVisible();
    // Focus never falls to <body>: the add input takes it.
    await expect(equipmentInput).toBeFocused();
    // The removal reaches the live region (the focused input says nothing
    // about what vanished).
    await expect(page.getByRole("status")).toContainText("temporary crane removed");
  });
});

test.describe("the 3.4 seam holds (AC8) + endpoint edges via direct requests", () => {
  test("hostile query strings render 200 AND no query value reaches the DOM — the 2.5 500 class", async ({
    page,
    request,
  }) => {
    // The worst two inputs the 2.5 review proved 500-capable from a legal URL:
    // a raw NUL byte and a lone (split) surrogate half. This page reads NO
    // query values, so neither can reach a decoder.
    for (const url of ["/en/rfq?q=%00", "/en/rfq?project=%ED%A0%80", "/en/rfq?unknown=&q="]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
    }
    // ⚠️ SPLIT BY STORY 3.4, NOT DELETED. This half used to put a marker in ALL
    // FIVE frozen params and assert none reached the DOM — which was true only
    // while the page read nothing. It is now the ANTI-SPOOFING proof, and it is
    // narrowed to the four SLUG params, where the rule still holds absolutely:
    // no label from the URL is ever rendered, because every catalog name the
    // banner shows is resolved from the slug through the repositories.
    //
    // The marker is itself a VALID SLUG (`zzq-marker-7f3` passes `isValidSlug`),
    // so it clears the gate and resolves to no row — which is exactly the case
    // worth proving. A URL naming rows that do not exist renders no banner and
    // no pre-fill, and above all puts none of its own text on the page.
    //
    // `q` is deliberately EXCLUDED here and asserted positively below: it is
    // buyer text, not a catalog label, and 3.4 carries it into the project
    // description on purpose.
    const marker = "zzq-marker-7f3";
    await page.goto(
      `/en/rfq?project=${marker}&product=${marker}&industry=${marker}&category=${marker}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(marker);
    // …and no banner at all, rather than an empty shell (AC2/AC6).
    await expect(page.getByTestId("rfq-prefill-banner")).toHaveCount(0);
  });

  test("/rfq declares index,follow robots in the rendered page — the predicate is WIRED, not just defined", async ({
    page,
  }, testInfo) => {
    // 3.2 review: rfq-page.test.ts proves the PREDICATE returns indexable, but
    // deleting `robots: robotsFor(rfqSignals(locale))` from the page kept every
    // suite green — this pins the page-side wiring.
    if (!dbReady) testInfo.skip();
    await page.goto("/en/rfq");
    const robots = page.locator('meta[name="robots"]').first();
    await expect(robots).toHaveAttribute("content", /index/);
    await expect(robots).not.toHaveAttribute("content", /noindex/);
  });

  test("multipart POST is ACCEPTED and writes a lead — the 3.7b inversion", async ({
    request,
  }, testInfo) => {
    // ⚠️ PLANNED INVERSION (Story 3.7b, AC14). This test was literally named
    // for the fact that attachments were 3.7b's problem: it asserted 415 and
    // no row. 3.7b makes multipart a first-class transport, so the assertion
    // flips. What survives unchanged is the CLAIM the suite needs — that the
    // media-type gate decides, and decides correctly.
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    const res = await request.post("/api/rfq", {
      headers: { "x-forwarded-for": fakeClientIp(testInfo.workerIndex) },
      multipart: {
        payload: JSON.stringify({
          name: "Elena Petrova",
          company: "Enka EPC",
          email,
          locale: "en",
          uiLocale: "en",
          consent: true,
        }),
      },
    });
    expect(res.status()).toBe(201);
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(1);
  });

  test("an unaccepted content type is still refused outright, with NO row", async ({
    request,
  }, testInfo) => {
    // The gate has to still BE a gate after the widening — otherwise the
    // inversion above would read as `guard 1 was deleted`.
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    const res = await request.post("/api/rfq", {
      headers: { "content-type": "text/plain" },
      data: email,
    });
    expect(res.status()).toBe(415);
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(0);
  });

  test("direct POST with consent:false → 422 envelope with the stable key, NO row", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    const res = await request.post("/api/rfq", {
      // Own bucket: a 422 still CONSUMES limiter budget (counting happens
      // before the body is read — 3.7a), so this must not share the socket.
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": fakeClientIp(testInfo.workerIndex),
      },
      data: {
        name: "Elena Petrova",
        company: "Enka EPC",
        email,
        locale: "en",
        uiLocale: "en",
        consent: false,
      },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; details: { path: string; key: string }[] };
    };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details).toContainEqual({ path: "consent", key: "consentRequired" });
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(0);
  });
});

test.describe("the /privacy stub (AC9)", () => {
  test("resolves in all three locales, noindex, and shows the version token consentVersion cites", async ({
    page,
  }) => {
    for (const locale of ["en", "tr", "ru"]) {
      await page.goto(`/${locale}/privacy`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // The stub's robots declaration — noindex BY INTENT (placeholder).
      // `.first()`: the suite's convention for a locator that can legally
      // match twice (3.2 review).
      const robots = page.locator('meta[name="robots"]').first();
      await expect(robots).toHaveAttribute("content", /noindex/);
      // The version line carries the EXACT token the endpoint writes into
      // Lead.consentVersion — anchored, not substring (3.2 review): a page
      // rendering privacy-2026-08-stub-r3-WRONG must fail here.
      await expect(page.locator('p[translate="no"]')).toHaveText(/privacy-2026-08-stub-r3$/);
    }
  });
});

test.describe("rate limiting (Story 3.7a — FR32: the six real POSTs)", () => {
  const jsonHeaders = (ip: string) => ({
    "content-type": "application/json",
    "x-forwarded-for": ip,
  });
  const validBody = (email: string) => ({
    name: "Elena Petrova",
    company: "Enka EPC",
    email,
    locale: "en",
    uiLocale: "en",
    consent: true,
  });

  test("SIX REAL POSTS: five 201s, the sixth → 429 + Retry-After + NO row; an unspoofed POST then proves bucket isolation live", async ({
    request,
  }, testInfo) => {
    // epics:936: "The proof is six real POSTs against a running server; a unit
    // test of the counter function alone does not satisfy this AC." This is
    // the only LIVE-SERVER gate that goes red if the limiter is ever moved to
    // middleware (proxy.ts excludes /api — it would fail open, silently); the
    // unit suite reddens too, but only this one exercises a real request path
    // — never interception-mock it.
    if (!dbReady) testInfo.skip();
    const bucket = fakeClientIp(testInfo.workerIndex);

    for (let i = 0; i < 5; i++) {
      const res = await request.post("/api/rfq", {
        headers: jsonHeaders(bucket),
        data: validBody(uniqueEmail(testInfo.workerIndex)),
      });
      expect(res.status(), `POST ${i + 1} of 5 must be unaffected`).toBe(201);
    }

    const sixthEmail = uniqueEmail(testInfo.workerIndex);
    const sixth = await request.post("/api/rfq", {
      headers: jsonHeaders(bucket),
      data: validBody(sixthEmail),
    });
    expect(sixth.status()).toBe(429);
    expect(Number(sixth.headers()["retry-after"])).toBeGreaterThan(0);
    const body = (await sixth.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(await withPrisma((db) => db.lead.count({ where: { email: sixthEmail } }))).toBe(0);

    // The live passthrough proof (Task 0 #6's P5): an UNSPOOFED POST lands in
    // a DIFFERENT bucket, so the spoofed header above was genuinely honored —
    // had Next ignored it, this would be the 7th on one shared bucket → 429.
    const unspoofed = await request.post("/api/rfq", {
      headers: { "content-type": "application/json" },
      data: validBody(uniqueEmail(testInfo.workerIndex)),
    });
    expect(unspoofed.status()).toBe(201);

    // …and the SOCKET-FILL half, which the 201 alone cannot prove (3.7a
    // review): with no fill, the header would be absent, the key would be
    // `unknown`, and the request would ALSO have landed in a fresh bucket and
    // returned 201. Only the minted key distinguishes the two — an IP-shaped
    // bucket means Next filled the header from the socket.
    const keys = await scanRateLimitKeys();
    const socketKeys = keys.filter((key) => {
      const value = key.slice("rfq:rl:".length);
      return value !== "unknown" && !value.startsWith("2001:db8:");
    });
    expect(
      socketKeys.length,
      `expected an IP-shaped socket bucket among ${JSON.stringify(keys)}`,
    ).toBeGreaterThan(0);
    expect(keys).not.toContain("rfq:rl:unknown");
  });

  test("a REJECTED submission still consumes budget — counting happens BEFORE the body is read", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const bucket = fakeClientIp(testInfo.workerIndex);

    for (let i = 0; i < 5; i++) {
      const res = await request.post("/api/rfq", {
        headers: jsonHeaders(bucket),
        data: { ...validBody(uniqueEmail(testInfo.workerIndex)), consent: false },
      });
      expect(res.status(), `422 number ${i + 1}`).toBe(422);
    }
    // The sixth is VALID — but five rejected submissions already spent the
    // window, which is exactly what "checked before the request body is
    // parsed" (epics:934) buys: validation outcome cannot refund budget.
    const email = uniqueEmail(testInfo.workerIndex);
    const sixth = await request.post("/api/rfq", {
      headers: jsonHeaders(bucket),
      data: validBody(email),
    });
    expect(sixth.status()).toBe(429);
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(0);
  });

  test("pre-limiter rejections never consume: six 415s cost the bucket nothing", async ({
    request,
  }, testInfo) => {
    // The seam position (guard 1 → guard 2 → limiter): junk content-types are
    // rejected before counting, so they can neither starve a bucket nor be
    // used to lock a victim IP out.
    if (!dbReady) testInfo.skip();
    const bucket = fakeClientIp(testInfo.workerIndex);

    for (let i = 0; i < 6; i++) {
      const res = await request.post("/api/rfq", {
        headers: { "content-type": "text/plain", "x-forwarded-for": bucket },
        data: "junk",
      });
      expect(res.status()).toBe(415);
    }
    const valid = await request.post("/api/rfq", {
      headers: jsonHeaders(bucket),
      data: validBody(uniqueEmail(testInfo.workerIndex)),
    });
    expect(valid.status()).toBe(201);
  });

  test("the UI shows the rate-limited copy — never submitFailed's retry invitation — and inputs survive", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);

    await page.route("**/api/rfq", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "1800" },
        body: JSON.stringify({
          error: { code: "rate_limited", message: "Too many submissions from this client." },
        }),
      }),
    );

    await openRfq(page);
    await fillMinimalForm(page, email);
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "Too many inquiries" });
    await expect(alert).toContainText("call us");
    await expect(alert).not.toContainText("try again");
    await expect(page.getByLabel("Work email")).toHaveValue(email);
  });
});

test.describe("the honeypot (Story 3.7a — Task 0 #1: silent drop + recovery log)", () => {
  test("filled honeypot → fake 201 with NO row; a real submission then out-references the burned fake", async ({
    request,
  }, testInfo) => {
    // Direct POST only: the field is aria-hidden + tabindex=-1, unreachable by
    // label/role locators BY CONSTRUCTION — never try to fill it in a browser.
    if (!dbReady) testInfo.skip();
    const bucket = fakeClientIp(testInfo.workerIndex);
    const trapEmail = uniqueEmail(testInfo.workerIndex);
    const numberOf = (reference: string) => Number(reference.slice("GLH-RFQ-".length));

    // BRACKET the fake between two real references (3.7a review): asserting
    // only `real > fake` is an upper bound, so a locally fabricated constant
    // BELOW the sequence head (e.g. "GLH-RFQ-2500") passed every assertion
    // while reintroducing the collision hazard the burn exists to prevent.
    const beforeEmail = uniqueEmail(testInfo.workerIndex);
    const before = await request.post("/api/rfq", {
      headers: { "content-type": "application/json", "x-forwarded-for": bucket },
      data: {
        name: "Elena Petrova",
        company: "Enka EPC",
        email: beforeEmail,
        locale: "en",
        uiLocale: "en",
        consent: true,
        website: "",
      },
    });
    expect(before.status()).toBe(201);
    const beforeReference = ((await before.json()) as { reference: string }).reference;

    const trapped = await request.post("/api/rfq", {
      headers: { "content-type": "application/json", "x-forwarded-for": bucket },
      data: {
        name: "Bot Botsson",
        company: "Spam GmbH",
        email: trapEmail,
        locale: "en",
        uiLocale: "en",
        consent: true,
        website: "https://definitely-a-bot.example",
      },
    });
    expect(trapped.status()).toBe(201);
    const fake = ((await trapped.json()) as { reference: string }).reference;
    // Ordinary success shape, format-identical — indistinguishable (epics:950).
    expect(fake).toMatch(/^GLH-RFQ-\d{4,}$/);
    // …but NOTHING was written: no row by email, no row behind the reference.
    expect(await withPrisma((db) => db.lead.count({ where: { email: trapEmail } }))).toBe(0);
    expect(await withPrisma((db) => db.lead.findUnique({ where: { reference: fake } }))).toBeNull();

    // The burn proof: the fake came from the REAL sequence, so the next
    // genuine lead's reference is numerically greater. (Never assert
    // contiguity — gaps are doctrine.)
    const realEmail = uniqueEmail(testInfo.workerIndex);
    const real = await request.post("/api/rfq", {
      headers: { "content-type": "application/json", "x-forwarded-for": bucket },
      data: {
        name: "Elena Petrova",
        company: "Enka EPC",
        email: realEmail,
        locale: "en",
        uiLocale: "en",
        consent: true,
        website: "",
      },
    });
    expect(real.status()).toBe(201);
    const realReference = ((await real.json()) as { reference: string }).reference;
    // The fake sits strictly INSIDE the live sequence window — true only if it
    // came from the sequence itself. Any local fabrication, large or small,
    // falls outside one of these bounds. (Never assert contiguity: gaps are
    // doctrine, and this run burns values by design.)
    expect(numberOf(fake)).toBeGreaterThan(numberOf(beforeReference));
    expect(numberOf(realReference)).toBeGreaterThan(numberOf(fake));
  });
});

test.describe("attachments (Story 3.7b — FR32a)", () => {
  // SERIAL, deliberately (3.7b review). The EICAR proof compares whole-bucket
  // `quarantine/` listings before and after its POST, and under fullyParallel
  // the KEYSTONE test's upload from another worker can land BETWEEN the two
  // listings — a false RED that reads as "an object was written". KEYSTONE is
  // the suite's ONLY quarantine writer and lives in this same describe, so
  // serializing these three tests removes the sole concurrent mutator; every
  // other suite is untouched and stays parallel.
  test.describe.configure({ mode: "serial" });

  /** Keys this suite created, cleaned up in afterAll so a run leaves the bucket
   *  as it found it (the storage half of the pollution gate). */
  const created: string[] = [];

  test.afterAll(async () => {
    for (const key of created) await deleteStorageKey(key);
  });

  test("KEYSTONE: a real browser upload is scanned, stored under quarantine/, and the row records it", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    if (!clamavReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    const pdf = cleanPdf("Hospital wing retrofit datasheet");
    await openRfq(page);
    await fillMinimalForm(page, email);
    // A REAL file input, driven the way a buyer drives it. Drag-and-drop is an
    // enhancement; if this stopped working the field would be unusable by
    // keyboard and on mobile, so this is the path worth proving.
    await page.getByLabel("Attachment").setInputFiles({
      name: "datasheet.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    // TWO assertions, because the filename legitimately appears twice and a
    // bare `getByText` hit both (strict-mode violation — which is itself the
    // evidence that the announcement fires). AC7 wants the selection announced
    // through the form's existing live region AND shown on screen.
    await expect(page.getByRole("status")).toContainText("datasheet.pdf attached");
    await expect(page.getByText("datasheet.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    await expect(page.getByRole("heading", { name: "Inquiry sent" })).toBeVisible();
    const referenceText = await page.getByText(/^GLH-RFQ-\d+$/).innerText();
    const row = await withPrisma((db) =>
      db.lead.findUnique({ where: { reference: referenceText } }),
    );

    expect(row, `no lead row for ${referenceText}`).not.toBeNull();
    // All six columns, written in the SAME insert as the lead (Task 0 #6).
    expect(row!.attachmentKey).toMatch(/^quarantine\/[0-9a-f-]{36}\.pdf$/);
    expect(row!.attachmentName).toBe("datasheet.pdf");
    // SERVER-derived: the browser sent application/pdf here, but the value must
    // come from the format table either way — see the smuggle test in the unit
    // suite for the case where the client lies.
    expect(row!.attachmentMime).toBe("application/pdf");
    expect(row!.attachmentSizeBytes).toBe(pdf.length);
    expect(row!.attachmentScanStatus).toBe("clean");
    expect(row!.attachmentScannedAt).not.toBeNull();
    created.push(row!.attachmentKey!);

    // AC9, first half — RETRIEVABILITY, proven at the STORAGE layer because no
    // shipped route serves this key (Story 4.7 owns that, behind 4.1's auth).
    // Without this, a wrong key would sit undetected until 4.7 tried to read it.
    expect(
      await storageKeyExists(row!.attachmentKey!),
      `stored key ${row!.attachmentKey} is not readable back`,
    ).toBe(true);

    // AC9, second half — NOTHING SERVES IT. The uuid is slug-shaped, so these
    // are the requests someone would actually try, not strawmen.
    const uuid = row!.attachmentKey!.slice("quarantine/".length).replace(/\.pdf$/, "");
    for (const url of [
      `/api/documents/${uuid}`,
      `/api/projects/hospital-fire-suppression/media/${uuid}`,
      `/${row!.attachmentKey}`,
      `/api/${row!.attachmentKey}`,
    ]) {
      expect((await request.get(url)).status(), url).toBe(404);
    }
  });

  test("EICAR: rejected with scanFailed, NO row, and NO object written", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    if (!clamavReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    const before = await listStorageKeys("quarantine/");

    // ⚠️ THE FIXTURE MUST REACH CLAMD, AND THE OBVIOUS FIXTURE DOES NOT.
    // AC13 warns that an EICAR test can pass because the upload was rejected at
    // INTAKE — and prescribes a bare `%PDF-` prefix as the fix. Measured against
    // the live container, that concatenation scans **clean**: clamd types it as
    // a PDF, runs the PDF parser, and the signature never fires. `eicarPdf()`
    // puts the signature inside a real PDF `stream` object, which IS detected
    // (`Eicar-Signature FOUND`). The `scanFailed` key below is what proves the
    // rejection came from the SCANNER and not from validation — an
    // intake-rejected file would carry `fileType` or `fileCorrupt` instead.
    const res = await request.post("/api/rfq", {
      headers: { "x-forwarded-for": fakeClientIp(testInfo.workerIndex) },
      multipart: {
        payload: JSON.stringify({
          name: "Elena Petrova",
          company: "Enka EPC",
          email,
          locale: "en",
          uiLocale: "en",
          consent: true,
        }),
        attachment: { name: "spec.pdf", mimeType: "application/pdf", buffer: eicarPdf() },
      },
    });

    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error: { details: { path: string; key: string }[] } };
    expect(body.error.details).toContainEqual({ path: "attachment", key: "scanFailed" });

    // Persist-first does NOT mean persist-anything: an infected submission
    // writes no lead at all.
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(0);
    // And the file never reached the bucket — which is what makes FR32a's
    // "scanned before storage" literally true rather than approximately true.
    expect(await listStorageKeys("quarantine/")).toEqual(before);
  });

  test("a disguised .xlsx is rejected at INTAKE, with a different key — never scanned", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    const res = await request.post("/api/rfq", {
      headers: { "x-forwarded-for": fakeClientIp(testInfo.workerIndex) },
      multipart: {
        payload: JSON.stringify({
          name: "Elena Petrova",
          company: "Enka EPC",
          email,
          locale: "en",
          uiLocale: "en",
          consent: true,
        }),
        // A REAL zip with the right magic bytes and the right extension. Only
        // the OPC container scan rejects it — and the key it earns is what
        // distinguishes this from the EICAR case above, so the two tests
        // genuinely cover different layers rather than the same 422 twice.
        attachment: {
          name: "bill-of-quantities.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: plainZip(),
        },
      },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error: { details: { path: string; key: string }[] } };
    expect(body.error.details).toContainEqual({ path: "attachment", key: "fileCorrupt" });
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(0);
  });
});

/**
 * THE DOORWAYS (Story 3.4 — FR15/FR22/FR28/FR17a-doorway).
 *
 * These go against RENDERED MARKUP and the real seed, because the whole subject
 * is server-side resolution: the URL carries a slug, and everything the buyer
 * sees is looked up from it. Nothing here asserts a value that came from the URL.
 */
test.describe("doorway pre-fill (Story 3.4)", () => {
  /** Open a pre-filled RFQ and wait for hydration, like `openRfq` does. */
  async function openDoorway(page: import("@playwright/test").Page, query: string) {
    await page.goto(`/en/rfq${query}`);
    await page.waitForFunction(() => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
    });
  }

  test("?project= pre-selects the industry and loads the DISTINCT categories as chips", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await openDoorway(page, "?project=lng-terminal-fire-gas-upgrade");

    await expect(page.getByLabel("Industry")).toHaveValue("oil-gas");
    // LNG links two products in two categories — a PARENT and its own child.
    // Both appear; rolling up to the parent would drop the specific one.
    const banner = page.getByTestId("rfq-prefill-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Fire & gas detection");
    await expect(banner).toContainText("Flame detectors");
    await expect(banner).toContainText("Oil & Gas");
    // ⚠️ THE SEPARATOR IS U+00B7 (·), NOT A HYPHEN (Task 0 #23) — and nothing
    // pinned it until the 3.4 review, though `PrefillBanner`'s docstring said
    // "it is pinned in an e2e assertion". Spelled from its code point so no
    // literal multi-byte character enters this file.
    await expect(banner).toContainText(String.fromCharCode(0x00b7));
    // Each chip is individually removable — the 44px floor, not the chip idiom.
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  });

  test("?project= with NO industry and NO links renders like a cold visit — no empty banner", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // The degenerate fixture Story 3.4 seeded for exactly this branch.
    await openDoorway(page, "?project=standalone-workshop-fitout");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("rfq-prefill-banner")).toHaveCount(0);
    await expect(page.getByLabel("Industry")).toHaveValue("");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  });

  test("?project= with an industry but ZERO products names ONLY the industry", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * ⚠️ THE PARTIAL-RESOLUTION BRANCH, which no shipped test covered (§H E2E
     * #12, written by the 3.4 review's completeness critic). The two doorway
     * tests either side of it exercise the extremes — LNG resolves BOTH an
     * industry and chips, `standalone-workshop-fitout` resolves NEITHER — so
     * nothing exercised exactly one. That is the branch AC2 is actually about:
     * "the banner names only the context that actually resolved".
     *
     * A regression that required BOTH an industry and chips before showing a
     * banner, or that emitted an empty chip section, would pass every other
     * doorway test in this file.
     */
    await openDoorway(page, "?project=refinery-gas-detection-retrofit");

    const banner = page.getByTestId("rfq-prefill-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Oil & Gas");
    // The industry resolved; there are no linked published products, so there
    // are no chips and no placeholder standing in for them.
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await expect(page.getByLabel("Industry")).toHaveValue("oil-gas");
  });

  test("AC13: the banner and every pre-filled value SURVIVE a failed submit", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * ⚠️ AC13 WAS EXAMINED BY NO REVIEW LENS AND HAS NO TEST AT ANY LEVEL —
     * found by the 3.4 review's completeness critic, which noticed the whole
     * acceptance criterion had shipped on inspection alone. Task 8 ticks both
     * halves.
     *
     * This half guards a SHIPPED invariant the form's own docstring calls
     * load-bearing: failed submits never clear entered input. An edit that
     * unmounted the banner on error, or called `reset()` on the 422 path, would
     * take every pre-filled value with it and nothing would go red.
     */
    await openDoorway(page, "?project=lng-terminal-fire-gas-upgrade");
    await expect(page.getByTestId("rfq-prefill-banner")).toBeVisible();

    // Force the submit to fail at the transport, leaving the form mounted.
    await page.route("**/api/rfq", (route) => route.abort());
    await page.getByLabel("Quantities").fill("12 detectors");
    await page.getByRole("button", { name: /send|submit/i }).click();

    // The banner is still here, and so is everything the doorway seeded.
    await expect(page.getByTestId("rfq-prefill-banner")).toBeVisible();
    await expect(page.getByLabel("Industry")).toHaveValue("oil-gas");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
    await expect(page.getByLabel("Quantities")).toHaveValue("12 detectors");
  });

  test("?product= loads the product AND its category, each removable independently", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await openDoorway(page, "?product=fd-9500");

    const removes = page.getByRole("button", { name: /^Remove / });
    await expect(removes).toHaveCount(2);
    // Removing one leaves the other — they are separate chips, not one blob.
    await removes.first().click();
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  });

  test("?industry= pre-selects the sector and loads no chips", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await openDoorway(page, "?industry=oil-gas");
    await expect(page.getByLabel("Industry")).toHaveValue("oil-gas");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  });

  test("?q= carries the sanitized query into the project description", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await openDoorway(page, "?q=fd9500x");
    await expect(page.getByLabel("Project description")).toHaveValue("fd9500x");
    await expect(page.getByTestId("rfq-prefill-banner")).toContainText("fd9500x");
  });

  test("CLEAR empties what the doorway seeded and KEEPS what I typed", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await openDoorway(page, "?project=lng-terminal-fire-gas-upgrade");

    // Something of the buyer's own, which Clear must not touch.
    await page.getByLabel("Quantities").fill("12 detectors, 2 panels");

    const clear = page.getByRole("button", { name: /Clear the pre-filled context/i });
    await expect(clear).toBeVisible();
    await clear.click();

    // "Clearing is not hiding": the VALUES are gone, not just the banner.
    await expect(page.getByTestId("rfq-prefill-banner")).toHaveCount(0);
    await expect(page.getByLabel("Industry")).toHaveValue("");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    // …and the buyer's own value survived.
    await expect(page.getByLabel("Quantities")).toHaveValue("12 detectors, 2 panels");
    // The removal is announced through the form's EXISTING live region.
    await expect(page.locator('[role="status"]')).toContainText("cleared");
    // ⚠️ FOCUS, WHICH NOTHING ASSERTED AT ANY LEVEL before the 3.4 review —
    // AC8 ends "focus moves to the first control the pre-fill touched" and
    // Task 4 ticked it. Deleting `target?.focus()` dropped focus to <body> when
    // the banner unmounted (the exact WCAG failure the code says it prevents)
    // and reddened nothing. This doorway seeded the industry, so that is first.
    await expect(page.getByLabel("Industry")).toBeFocused();
  });

  test("AC12: reaching a SECOND doorway through a client-side journey re-fills", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * ⚠️ THIS TEST DOES NOT PROVE AN ISLAND KEY, AND ITS TITLE USED TO SAY IT
     * DID (3.4 review). No key exists: one was written, nothing could redden on
     * its removal, and a probe showed Next 16's App Router already remounts the
     * island across this navigation on its own (Completion Note 3). A test
     * naming a mechanism the code does not contain sends the next reader looking
     * for it.
     *
     * What it DOES pin is the observable behaviour AC12 asks for: arrive at one
     * doorway, journey to another, and the form reflects the SECOND. If a future
     * Next version stops remounting, this goes red and whoever fixes it does so
     * with a failing test in hand.
     *
     * Note the route changes in between (`/rfq` → `/products` → `/rfq`), so the
     * island unmounts for that reason alone. The same-route case — two `/rfq`
     * URLs with no other page between — is covered by the language-switch test
     * below, which is the only in-app link that navigates `/rfq` → `/rfq`.
     */
    // Start at the CATALOGUE, so every later step can be a client-side click.
    await page.goto("/en/products");
    await page
      .getByRole("link", { name: /FD-9500|Triple-IR/i })
      .first()
      .click();
    await page.waitForURL("**/products/fd-9500");
    await page
      .getByRole("main")
      .getByRole("link", { name: /quote|inquiry/i })
      .first()
      .click();
    await page.waitForURL("**/rfq?product=fd-9500");
    await expect(page.getByTestId("rfq-prefill-banner")).toContainText("Flame Detector");

    // Back to the catalogue and into a DIFFERENT product — all client-side.
    await page.goBack();
    await page.waitForURL("**/products/fd-9500");
    await page.goBack();
    await page.waitForURL("**/products");
    await page
      .getByRole("link", { name: /GD-410/i })
      .first()
      .click();
    await page.waitForURL("**/products/gd-410");
    await page
      .getByRole("main")
      .getByRole("link", { name: /quote|inquiry/i })
      .first()
      .click();
    await page.waitForURL("**/rfq?product=gd-410");

    const banner = page.getByTestId("rfq-prefill-banner");
    await expect(banner).toContainText("GD-410");
    // …and NONE of the first doorway's context survives.
    await expect(banner).not.toContainText("Flame Detector");
  });

  test("KEYSTONE: a doorway submit persists source + prefillContext, and the banner goes with the form", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * ⚠️ §H E2E #19, "THE KEYSTONE", WAS NEVER WRITTEN (3.4 review). Story 3.4
     * ticked Task 6 and Task 10 while the only attribution tests mocked
     * `createLead` — so nothing anywhere proved that `Lead.source` and
     * `Lead.prefillContext` survive the round trip into Postgres. The columns
     * are what Story 4.7's admin reads; a JSONB shape that never reached the
     * database would have been discovered there.
     *
     * It also carries AC13's SUCCESS half (Task 0 #58), which no lens examined:
     * the banner is rendered inside the success conditional, so on a 201 it must
     * disappear with the form rather than sit beside the thank-you surface still
     * offering a Clear button for a submission that already happened.
     */
    const email = uniqueEmail(testInfo.workerIndex);
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    await openDoorway(page, "?project=lng-terminal-fire-gas-upgrade");
    await expect(page.getByTestId("rfq-prefill-banner")).toBeVisible();
    await fillMinimalForm(page, email);
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    await expect(page.getByRole("heading", { name: "Inquiry sent" })).toBeVisible();
    // AC13's success half: the banner left with the form.
    await expect(page.getByTestId("rfq-prefill-banner")).toHaveCount(0);

    const referenceText = await page.getByText(/^GLH-RFQ-\d+$/).innerText();
    const row = await withPrisma((db) =>
      db.lead.findUnique({ where: { reference: referenceText } }),
    );
    expect(row, `no lead row for on-screen reference ${referenceText}`).not.toBeNull();
    // The doorway, recorded server-side — not a value the browser chose.
    expect(row!.source).toBe("project");
    expect(row!.prefillContext).toMatchObject({
      resolved: { project: "lng-terminal-fire-gas-upgrade" },
      cleared: false,
    });
  });

  test("the banner RENDERS in TR and RU — not just EN", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ NOTHING ASSERTED THAT /tr/rfq OR /ru/rfq RENDER AT ALL before Story
    // 3.4. This is the class Story 3.3's review found in the email copy: a
    // placeholder typo emits the LITERAL KEY PATH, and every EN-only test
    // stays green while a Turkish buyer reads "Rfq.prefillProject".
    for (const locale of ["tr", "ru"]) {
      await page.goto(`/${locale}/rfq?industry=oil-gas`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const banner = page.getByTestId("rfq-prefill-banner");
      await expect(banner).toBeVisible();
      // A collapsed key path is the literal namespace prefix.
      await expect(banner).not.toContainText("Rfq.");
      // The industry name is resolved server-side, so it is present whichever
      // locale it fell back from.
      await expect(banner).toContainText(/Oil|Нефть|Petrol/);
    }
  });

  test("a pre-filled URL stays canonical to the BARE /rfq — no parameter-spam indexing", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * Task 0 #41 wrote its own verification instruction — "e2e/rfq.spec.ts:524
     * and rfq-page.test.ts prove index,follow for the BARE URL only, so do not
     * read their greenness as coverage" — and nobody discharged it (3.4 review's
     * completeness critic).
     *
     * It matters because this page is deliberately INDEXABLE and, since Story
     * 3.4, reflects up to 80 code points of buyer text from `?q=` into rendered
     * markup. The only thing between that and parameter-spam indexing is
     * `alternatesFor` being searchParams-independent — one function call that no
     * test observed on a doorway URL.
     */
    await page.goto("/en/rfq?q=fd9500x&project=lng-terminal-fire-gas-upgrade");
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /\/en\/rfq$/);
  });

  test("AC7: a fallen-back name in the banner is MARKED, visibly and for a screen reader", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * ⚠️ `oil-gas` CANNOT EXERCISE THIS, which is why the test above does not
     * (3.4 review). The seed gives `oil-gas` both a Turkish and a Russian name
     * (`seed.ts`), so it never falls back and `FallbackNotice` renders nothing —
     * the story's own §H mutation "drop the marker" was inert against it.
     *
     * `energy` is EN-ONLY in the seed, so it falls back in BOTH other locales.
     * That makes UX-DR21's per-value marker observable for the first time.
     */
    const marker = { tr: "İngilizce gösteriliyor", ru: "показано на английском" };
    for (const locale of ["tr", "ru"] as const) {
      await page.goto(`/${locale}/rfq?industry=energy`);
      const banner = page.getByTestId("rfq-prefill-banner");
      await expect(banner).toBeVisible();
      // The VISIBLE half: the localized "shown in English" hint.
      await expect(banner).toContainText(marker[locale]);
      // The ANNOUNCED half: the fallen-back CONTENT itself carries lang="en",
      // so a screen reader switches voice rather than reading an English name
      // with Turkish or Russian phonemes (FallbackNotice's caller contract).
      await expect(banner.locator('[lang="en"]')).toContainText("Energy");
    }
  });

  test("AC12: the LANGUAGE SWITCH preserves the doorway and re-resolves it, both directions", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * Task 0 #57 — ticked by Story 3.4 with no test behind it anywhere, which
     * its own review found. This is also the ONLY genuine same-route soft
     * navigation on this page: `LanguageSwitcher` preserves the query string
     * deliberately, so `/en/rfq?project=x` → `/tr/rfq?project=x` is a
     * client-side navigation between two DIFFERENT `/rfq` URLs.
     *
     * It crosses the fallback logic too: one project's names can be a fallback
     * in one locale and native in another, so re-resolution must actually re-run
     * rather than carry the first locale's strings across.
     */
    await openDoorway(page, "?project=lng-terminal-fire-gas-upgrade");
    await expect(page.locator('select[name="industry"]')).toHaveValue("oil-gas");

    const header = page.getByRole("banner");
    await header.getByRole("link", { name: "Türkçe" }).click();
    await page.waitForURL("**/tr/rfq?project=lng-terminal-fire-gas-upgrade");

    // The doorway SURVIVED the switch and re-resolved in Turkish.
    const banner = page.getByTestId("rfq-prefill-banner");
    await expect(banner).toBeVisible();
    await expect(banner).not.toContainText("Rfq.");
    await expect(banner).toContainText("Petrol ve Gaz");
    await expect(page.locator('select[name="industry"]')).toHaveValue("oil-gas");

    // …and back again. The reverse direction is asserted because the switcher
    // builds its href from the CURRENT pathname, so the two directions are not
    // the same code path.
    await header.getByRole("link", { name: "English" }).click();
    await page.waitForURL("**/en/rfq?project=lng-terminal-fire-gas-upgrade");
    await expect(page.getByTestId("rfq-prefill-banner")).toContainText("Oil & Gas");
    await expect(page.locator('select[name="industry"]')).toHaveValue("oil-gas");
  });
});
