import { describe, it, expect, afterEach, vi } from "vitest";

// Same stub as seo.test.ts — next-intl's navigation entry cannot resolve under
// vitest (see that file's note). robots.ts pulls it in transitively via @/lib/seo.
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    href === "/" ? `/${locale}` : `/${locale}${href}`,
}));

import robots from "./robots";

/**
 * `robots()` is a pure function of two env vars, and before this test NOTHING
 * executed its allow-branch: SITE_ALLOW_INDEXING is set in no CI job, no Playwright
 * config and no committed env file, and the single e2e assertion is satisfied by
 * either branch. The `sitemap:` / `host:` / `Disallow: /api` lines could all have
 * been wrong and every gate would still have been green.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots() — indexing NOT allowed (the shipped default)", () => {
  it("disallows everything when the flag is unset", () => {
    vi.stubEnv("SITE_ALLOW_INDEXING", "");
    vi.stubEnv("SITE_URL", "https://glh.example");
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });

  it("still references the sitemap, so AC4 holds in EVERY environment", () => {
    vi.stubEnv("SITE_ALLOW_INDEXING", "");
    vi.stubEnv("SITE_URL", "https://glh.example");
    expect(robots().sitemap).toBe("https://glh.example/sitemap.xml");
  });

  it("does not opt in on near-miss values", () => {
    vi.stubEnv("SITE_URL", "https://glh.example");
    for (const value of ["false", "1", "yes", "on", "TRUE-ish", ""]) {
      vi.stubEnv("SITE_ALLOW_INDEXING", value);
      expect(robots().rules, `"${value}" must not enable crawling`).toEqual([
        { userAgent: "*", disallow: "/" },
      ]);
    }
  });
});

describe("robots() — indexing allowed (the production branch)", () => {
  it("allows crawling, keeps /api out, and names the sitemap and host", () => {
    vi.stubEnv("SITE_ALLOW_INDEXING", "true");
    vi.stubEnv("SITE_URL", "https://greenlighthouse.example");

    const result = robots();
    expect(result.rules).toEqual([{ userAgent: "*", allow: "/", disallow: "/api" }]);
    expect(result.sitemap).toBe("https://greenlighthouse.example/sitemap.xml");
    expect(result.host).toBe("https://greenlighthouse.example");
  });

  it("accepts the flag case-insensitively and trimmed, as the code actually does", () => {
    vi.stubEnv("SITE_URL", "https://glh.example");
    for (const value of ["true", "TRUE", "True", "  true  "]) {
      vi.stubEnv("SITE_ALLOW_INDEXING", value);
      expect(robots().host, `"${value}" should enable crawling`).toBe("https://glh.example");
    }
  });

  it("never emits a double slash before sitemap.xml, whatever SITE_URL's trailing form", () => {
    vi.stubEnv("SITE_ALLOW_INDEXING", "true");
    vi.stubEnv("SITE_URL", "https://glh.example/");
    expect(robots().sitemap).toBe("https://glh.example/sitemap.xml");
  });
});
