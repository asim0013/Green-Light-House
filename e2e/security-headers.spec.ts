import { test, expect } from "@playwright/test";

/**
 * Security response headers (Story 5.7 — NFR6). Asserts the hardening headers
 * actually ship on real responses — the static set (next.config, every route) and
 * the per-request nonce-CSP (proxy.ts, page routes).
 *
 * ⚠️ Runs against `next dev` (the Playwright webServer), so the CSP carries the
 * DEV loosening (`'unsafe-eval'`, `ws:`). This asserts the INVARIANT parts present
 * in both dev and prod (nonce, frame-ancestors, object-src) — never the absence of
 * the dev tokens, which would wrongly fail in dev. Named without "caching".
 */

const STATIC_HEADERS: Record<string, RegExp> = {
  "strict-transport-security": /max-age=\d+/,
  "x-content-type-options": /nosniff/,
  "x-frame-options": /DENY/,
  "referrer-policy": /strict-origin-when-cross-origin/,
  "permissions-policy": /camera=\(\)/,
};

test.describe("security headers (AC1)", () => {
  test("a page response carries every static header + a nonce-CSP", async ({ request }) => {
    const res = await request.get("/en");
    expect(res.status()).toBe(200);
    const h = res.headers();
    for (const [name, pattern] of Object.entries(STATIC_HEADERS)) {
      expect(h[name], `missing/!match ${name}`).toMatch(pattern);
    }
    const csp = h["content-security-policy"];
    expect(csp, "no CSP on the page").toBeTruthy();
    // Invariant in dev AND prod: a nonce'd script-src, no framing, no plugins.
    expect(csp).toMatch(/script-src[^;]*'nonce-[\w+/=-]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // No framework fingerprint (launch review; `poweredByHeader: false`).
    expect(h["x-powered-by"], "X-Powered-By leaks the framework").toBeUndefined();
  });

  test("the static headers also cover a non-page route (next.config, not proxy)", async ({
    request,
  }) => {
    // `/sitemap.xml` is excluded from the proxy matcher (has a dot), so it carries
    // NO CSP — but the next.config headers apply to every route, proving the static
    // set is not proxy-scoped.
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["x-content-type-options"]).toMatch(/nosniff/);
    expect(h["x-frame-options"]).toMatch(/DENY/);
  });

  test("the CSP nonce matches the script nonce AND is fresh per request", async ({ request }) => {
    const nonceOf = async () => {
      const res = await request.get("/en");
      const csp = res.headers()["content-security-policy"] ?? "";
      const headerNonce = csp.match(/'nonce-([\w+/=-]+)'/)?.[1];
      const scriptNonce = (await res.text()).match(/nonce="([\w+/=-]+)"/)?.[1];
      expect(headerNonce, "no nonce in CSP header").toBeTruthy();
      expect(scriptNonce, "Next did not nonce its scripts").toBeTruthy();
      // Equal within a request ⇒ the browser runs Next's scripts (no white screen).
      expect(scriptNonce).toBe(headerNonce);
      return headerNonce;
    };
    const first = await nonceOf();
    const second = await nonceOf();
    // Per-request ⇒ a static/reused nonce (which defeats the CSP) fails here.
    expect(second, "nonce is not fresh per request").not.toBe(first);
  });
});
