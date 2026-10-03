/**
 * Story 5.5 — performance measurement (NFR1/NFR2). Measures LCP, document
 * interactivity and search response against a RUNNING PROD build, and prints the
 * numbers. Run it against `next start`, NEVER `next dev` (dev numbers are
 * meaningless):
 *
 *   rm -rf .next && npm run build && (PORT=3100 npm start &) && \
 *     sleep 6 && BASE=http://localhost:3100 node scripts/measure-perf.mjs
 *
 * It asserts only GROSS-regression ceilings (LCP < 4s, search < 3s) — the 2.5s /
 * 3.5s / 1s AC targets are machine-dependent, so the recorded numbers are the
 * deliverable, not a hard pass/fail. CI perf-gating is deferred (needs a
 * prod-build CI job) — see deferred-work.md.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";

async function navTiming(page) {
  return page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return {
      ttfb: Math.round(n.responseStart - n.requestStart),
      domInteractive: Math.round(n.domInteractive),
      load: Math.round(n.loadEventEnd || n.duration),
    };
  });
}

async function lcpOf(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const e = list.getEntries();
          const last = e[e.length - 1];
          resolve(Math.round(last.renderTime || last.loadTime || last.startTime));
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(-1), 4000);
      }),
  );
}

const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];

// Homepage — LCP + interactivity.
await page.goto(`${BASE}/en`, { waitUntil: "load" });
const homeLcp = await lcpOf(page);
const home = await navTiming(page);
rows.push({ page: "/en (home)", lcp_ms: homeLcp, ...home });

// Product detail — a key interactive page.
await page.goto(`${BASE}/en/products/fd-9500`, { waitUntil: "load" });
rows.push({ page: "/en/products/fd-9500", lcp_ms: await lcpOf(page), ...(await navTiming(page)) });

// Search — model-number query (Story 2.5), under seed data.
await page.goto(`${BASE}/en/products?q=fd-9500`, { waitUntil: "load" });
const search = await navTiming(page);
rows.push({ page: "/en/products?q=fd-9500 (search)", lcp_ms: await lcpOf(page), ...search });

await browser.close();

console.table(rows);

// Gross-regression guards only (not the AC targets).
const home_ = rows[0];
const search_ = rows[2];
let failed = false;
if (home_.lcp_ms > 4000) {
  console.error(`GROSS REGRESSION: home LCP ${home_.lcp_ms}ms > 4000ms`);
  failed = true;
}
if (search_.load > 3000) {
  console.error(`GROSS REGRESSION: search load ${search_.load}ms > 3000ms`);
  failed = true;
}
console.log(
  `\nAC targets (informational, machine-dependent): home LCP < 2500ms (got ${home_.lcp_ms}), ` +
    `search < 1000ms (load ${search_.load}, ttfb ${search_.ttfb}).`,
);
process.exit(failed ? 1 : 0);
