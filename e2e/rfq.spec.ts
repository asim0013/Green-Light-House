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
  // Worker-first so the per-worker afterAll can clean by prefix — see below.
  return `${E2E_EMAIL_PREFIX}w${workerIndex}-${Date.now()}@example.com`;
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
  // Scoped to THIS worker's rows. Under fullyParallel the file's afterAll runs
  // once per worker, and a whole-prefix deleteMany here raced the other
  // workers — proven live in the first full-suite run: worker A's cleanup
  // deleted worker B's row between B's submit and B's count-by-email, turning
  // an expected 1 into 0. The whole-prefix sweep belongs to the post-suite
  // pollution gate, where nothing is in flight.
  await withPrisma((db) =>
    db.lead.deleteMany({
      where: { email: { startsWith: `${E2E_EMAIL_PREFIX}w${testInfo.workerIndex}-` } },
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
    expect(row!.equipment).toEqual([{ kind: "freeText", text: "20 t overhead crane" }]);
    expect(row!.locale).toBe("en");
    expect(row!.consent).toBe(true);
    expect(row!.consentAt).not.toBeNull();
    expect(row!.consentVersion).toBe("privacy-2026-08-stub:en");
    // Task 0 #7: no pre-fill exists yet, so source is the DB default.
    expect(row!.source).toBe("direct");
  });

  test("reload after success: ONE row by email, and the empty form returns (disclosed AC7 behavior)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);

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

  test("consent unchecked: 422 path, error announced on the checkbox, NO row (AC4's write barrier)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);

    await openRfq(page);
    await page.getByLabel("Full name").fill("Elena Petrova");
    await page.getByLabel("Company").fill("Enka EPC");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#rfq-consent-error")).toContainText("agree");
    // Entered input SURVIVES the failed submit (AC5).
    await expect(page.getByLabel("Work email")).toHaveValue(email);
    expect(await withPrisma((db) => db.lead.count({ where: { email } }))).toBe(0);
  });
});

test.describe("persist failure (AC3/AC7's other half)", () => {
  test("a 500 from the endpoint keeps EVERY entered value on screen and says so", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const email = uniqueEmail(testInfo.workerIndex);

    // Postgres-down without touching Postgres: intercept the POST at the
    // network layer and answer with the route's real 500 envelope.
    await page.route("**/api/rfq", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "internal_error", message: "The inquiry could not be saved." },
        }),
      }),
    );

    await openRfq(page);
    await fillMinimalForm(page, email);
    await page.getByLabel("Project description").fill("Survives the failure.");
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    // The failure is stated… (`.filter({hasText})`, because Next's own route
    // announcer is a second, empty role=alert — never `has:`-rooted locators.)
    await expect(page.getByRole("alert").filter({ hasText: "could not be sent" })).toContainText(
      "try again",
    );
    // …and NOTHING the buyer typed is lost (the retry costs re-reading, not
    // re-typing — FR29's client half).
    await expect(page.getByLabel("Work email")).toHaveValue(email);
    await expect(page.getByLabel("Project description")).toHaveValue("Survives the failure.");
    await expect(page.getByRole("checkbox")).toBeChecked();
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
});

test.describe("the 3.4 seam holds (AC8) + endpoint edges via direct requests", () => {
  test("hostile query strings render 200 and reach no code path — the 2.5 500 class", async ({
    request,
  }) => {
    // The worst two inputs the 2.5 review proved 500-capable from a legal URL:
    // a raw NUL byte and a lone (split) surrogate half. This page reads NO
    // query values, so neither can reach a decoder.
    for (const url of ["/en/rfq?q=%00", "/en/rfq?project=%ED%A0%80", "/en/rfq?unknown=&q="]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
    }
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
      headers: { "content-type": "application/json" },
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
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex/);
      // The version line carries the exact token the endpoint writes into
      // Lead.consentVersion — the FR44 chain is only honest if they match.
      await expect(page.getByText("privacy-2026-08-stub")).toBeVisible();
    }
  });
});
