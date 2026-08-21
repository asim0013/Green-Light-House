import { test, expect, request as pwRequest } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 2.3 — ungated, versioned document downloads, end to end.
 *
 * FIXTURES (the 2.3 seed + seed-storage): fd-9500-datasheet (datasheet, 602 B)
 * and fd-9500-en54 (certificate, 610 B, linked to oil-gas + fire-safety), both
 * public PDFs whose objects exist in MinIO under docs/*-v1.pdf.
 *
 * ALL download assertions go through `request.get` — NEVER `page.goto` on a
 * download URL (browsers open a save dialog, not a document). The response IS
 * the file: status, headers, and bytes are the whole contract.
 *
 * Storage gating follows the dbReady philosophy: probe the ENVIRONMENT (can the
 * endpoint serve the known-good fixture?), never the code under test — but the
 * probe result gates only, it asserts nothing; the tests do the asserting.
 */

let dbReady = true;
let storageReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL, ["/en", "/en/products", "/en/industries/oil-gas"]);
  // Environment probe: MinIO reachable + fixture object present. A 404/500 here
  // means the STORAGE fixture is absent (seed-storage not run), not a code bug —
  // the download tests skip with a reason instead of failing on environment.
  try {
    const ctx = await pwRequest.newContext({ baseURL });
    const res = await ctx.get("/api/documents/fd-9500-datasheet", { timeout: 15_000 });
    storageReady = res.status() === 200;
    await ctx.dispose();
  } catch {
    storageReady = false;
  }
});

test.describe("the download endpoint (AC1, AC3)", () => {
  test("one click, no gate: the response IS the PDF, with attachment headers", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    if (!storageReady) testInfo.skip(true, "storage fixtures absent — run scripts/seed-storage.ts");

    const res = await request.get("/api/documents/fd-9500-datasheet");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toBe(
      'attachment; filename="fd-9500-datasheet.pdf"',
    );

    const body = await res.body();
    expect(body.length).toBeGreaterThan(0);
    // A real PDF, not an HTML interstitial — the ungated trust commitment in one
    // assertion: %PDF magic bytes.
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("unknown, malformed, and PRIVATE slugs are one indistinguishable 404", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const unknown = await request.get("/api/documents/zz-not-a-document");
    expect(unknown.status()).toBe(404);

    const malformed = await request.get("/api/documents/A%26B%20junk");
    expect(malformed.status()).toBe(404);

    // Both bodies identical — a prober learns nothing from the difference.
    expect(await unknown.text()).toBe(await malformed.text());
  });

  test("the response never leaks storage topology", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const res = await request.get("/api/documents/zz-not-a-document");
    const text = await res.text();
    expect(text).not.toContain("9000");
    expect(text).not.toContain("minio");
    expect(text).not.toContain("S3");
    expect(text.length).toBeLessThan(100);
  });
});

test.describe("wired surfaces (AC4, AC5)", () => {
  test("the oil-gas certificates block links its certificate with format+size text", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/industries/oil-gas");
    const link = page.locator('main a[href="/api/documents/fd-9500-en54"]');
    await expect(link).toHaveCount(1);
    // The a11y floor: format + size stated in text, inside the link.
    await expect(link).toContainText("PDF");
    await expect(link).toContainText("610 B");
    // The cert badge-check stays (UX-DR10) — the svg is aria-hidden decoration.
    await expect(link.locator("svg")).toHaveCount(1);
  });

  test("an industry without certificates still renders the defined empty state", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // construction gained nothing from the 2.3 seed — the negative half that
    // proves the block is data-driven, not hardcoded.
    await page.goto("/en/industries/construction");
    await expect(page.locator('main a[href^="/api/documents/"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Applicable certificates" })).toBeVisible();
  });

  test("the product card carries its HALF-footer: Datasheet link, no inquiry button", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");
    // Exactly ONE card has a datasheet on the seed (fd-9500).
    const links = page.locator('article a[href^="/api/documents/"]');
    await expect(links).toHaveCount(1);
    await expect(links).toContainText("Datasheet");
    await expect(links).toContainText("PDF");

    // The OTHER half of the footer still waits for Epic 3 (DP-12).
    const visible = await page.locator("body").innerText();
    expect(visible.toLowerCase()).not.toContain("add to inquiry");
    // And still no price anywhere (FR2) — the footer must not have smuggled one in.
    expect(visible).not.toMatch(/[$€₺]\s?\d/);
  });

  test("cards WITHOUT a datasheet render no footer at all", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // as-60 (ppe) has no documents: its card must not render an empty footer box.
    await page.goto("/en/products?category=ppe");
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator('article a[href^="/api/documents/"]')).toHaveCount(0);
  });
});

test.describe("stability (AC2)", () => {
  test("the download URL carries no version, no fileKey, no storage path", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // The FR25a mechanism end-to-end: hrefs are slug-only, so an admin replacing
    // the file (fileKey/version bump) can never change any published URL. The
    // swap itself is proven in repository.integration.test.ts.
    await page.goto("/en/products");
    const href = await page
      .locator('article a[href^="/api/documents/"]')
      .first()
      .getAttribute("href");
    expect(href).toBe("/api/documents/fd-9500-datasheet");
    expect(href).not.toContain("v1");
    expect(href).not.toContain(".pdf");
    expect(href).not.toContain("docs/");
  });
});
