import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Automated WCAG 2.1 AA sweep (Story 5.4, AC3 — NFR3). Runs axe-core against one
 * page per PUBLIC template family in all three locales and fails on any
 * serious/critical violation. This is the regression backbone; the token-pairing
 * unit test (`src/app/token-contrast.test.ts`) covers the design-system contract
 * independently, and the manual checklist (§D of the story) covers what axe can't.
 *
 * ⚠️ PUBLIC PAGES ONLY — the admin area is authenticated and is not the AC's
 * subject ("a buyer using assistive technology"). Admin a11y is logged in
 * `deferred-work.md`.
 *
 * ⚠️ NAMED `a11y.spec.ts` — nothing with "caching" in the name (the contact.spec
 * lesson about the unanchored caching-suite regex).
 *
 * Seeded detail slugs: industry `fire-safety`, product `fd-9500`, project
 * `hospital-fire-suppression`. No SelectionGuide is seeded, so `/guides` is swept
 * as its (valid) empty-state index and there is no guide detail to sweep.
 */

const PATHS = [
  "/",
  "/industries",
  "/industries/fire-safety",
  "/products",
  "/products/fd-9500",
  "/services",
  "/projects",
  "/projects/hospital-fire-suppression",
  "/rfq",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/guides",
] as const;

const LOCALES = ["en", "tr", "ru"] as const;
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function url(locale: string, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) {
    expect(dbReady, "CI provisions Postgres — an unreachable DB here is a defect").toBe(true);
  }
  // Pre-compile the dev routes so the per-test goto is not a cold compile.
  await warmUp(
    baseURL,
    PATHS.map((p) => url("en", p)),
  );
});

for (const locale of LOCALES) {
  for (const path of PATHS) {
    const u = url(locale, path);
    test(`axe: ${u} — no serious/critical WCAG 2.1 AA violations`, async ({ page }, testInfo) => {
      if (!dbReady) testInfo.skip();

      await page.goto(u);
      // Prove the page actually RENDERED (an h1) before auditing — a streamed error
      // shell with no landmarks would otherwise pass axe vacuously.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      // Surface the rule id + the offending selectors, so a failure is actionable.
      expect(
        blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
        `${u} has ${blocking.length} serious/critical violation(s)`,
      ).toEqual([]);
    });
  }
}
