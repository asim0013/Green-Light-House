import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

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
      reference: string;
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

function uniqueEmail(workerIndex: number): string {
  // Worker + PID so the per-worker afterAll can clean by prefix without ever
  // touching a CONCURRENT invocation of this suite (3.2 review: `w<n>-` alone
  // is identical for worker n of any two simultaneous runs).
  return `${E2E_EMAIL_PREFIX}w${workerIndex}-p${process.pid}-${Date.now()}@example.com`;
}

let ipSeq = 0;

/**
 * A globally-unique, `net.isIP`-valid client bucket for the rate limiter
 * (Story 3.7a). Next's server passes a client-sent `x-forwarded-for` through
 * UNTOUCHED in direct-connect, and the route's policy keys on the rightmost
 * entry — so every test that POSTs gets its OWN counter bucket, which is what
 * makes the suite order-independent, same-hour-rerun-proof and CI-retry-proof
 * (counters persist in Redis for 1h; the shared-socket bucket arithmetic
 * could not fit even one clean re-run). Documentation range (2001:db8::/32),
 * pid+time+seq so two concurrent or back-to-back runs never share a bucket.
 */
function fakeClientIp(workerIndex: number): string {
  ipSeq += 1;
  return `2001:db8:${(process.pid % 0xffff).toString(16)}:${workerIndex}:${ipSeq}:${(Date.now() % 0xffff).toString(16)}::1`;
}

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) {
    expect(
      dbReady,
      "CI provisions Postgres — an unreachable DB here is a defect, not an environment",
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
    expect(row!.consentVersion).toBe("privacy-2026-08-stub-r2:en");
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
    // AC8's second half (3.2 review: previously unasserted): a UNIQUE marker
    // in every frozen prefill param must not reach the RENDERED DOM. Asserted
    // on innerText, not the raw response — Next's own router state legally
    // echoes the URL inside <script> payloads; AC8's claim is about what a
    // reader (or a copy-paste) can meet, and that is DOM text.
    const marker = "zzq-marker-7f3";
    await page.goto(
      `/en/rfq?q=${marker}&project=${marker}&product=${marker}&industry=${marker}&category=${marker}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(marker);
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

  test("multipart POST is rejected outright with NO row — attachments are 3.7b's", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);
    const res = await request.post("/api/rfq", {
      headers: { "content-type": "multipart/form-data; boundary=x" },
      data: `--x\r\nContent-Disposition: form-data; name="email"\r\n\r\n${email}\r\n--x--`,
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
      // rendering privacy-2026-08-stub-r2-WRONG must fail here.
      await expect(page.locator('p[translate="no"]')).toHaveText(/privacy-2026-08-stub-r2$/);
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
    // also the ONLY gate that goes red if the limiter is ever moved to
    // middleware (proxy.ts excludes /api — it would fail open, silently) —
    // never interception-mock it.
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

    // The live passthrough/socket-fill proof (Task 0 #6's P5): an UNSPOOFED
    // POST lands in the socket-filled bucket, not this exhausted one — if
    // Next did not pass the spoofed header through (or did not fill the
    // absent one from the socket), this request would be the 7th on ONE
    // shared bucket and 429.
    const unspoofed = await request.post("/api/rfq", {
      headers: { "content-type": "application/json" },
      data: validBody(uniqueEmail(testInfo.workerIndex)),
    });
    expect(unspoofed.status()).toBe(201);
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
    const numberOf = (reference: string) => Number(reference.slice("GLH-RFQ-".length));
    expect(numberOf(realReference)).toBeGreaterThan(numberOf(fake));
  });
});
