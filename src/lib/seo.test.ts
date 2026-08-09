import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * next-intl's navigation module is a react-client entry that vite cannot resolve
 * under vitest (it imports `next/navigation`), so it is stubbed — the same
 * approach `HomeHero.test.tsx` already uses.
 *
 * The stub is faithful to `localePrefix: "always"`, which is what
 * `src/i18n/routing.ts` configures. These tests therefore cover THIS module's
 * logic (self-canonical, full language map, x-default); the REAL `getPathname`
 * output is asserted end-to-end in `e2e/seo.spec.ts` against the running app,
 * so the mock cannot hide a routing change.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    href === "/" ? `/${locale}` : `/${locale}${href}`,
}));

import {
  siteOrigin,
  absoluteUrl,
  alternatesFor,
  thinContentReason,
  robotsFor,
  allowsIndexing,
} from "./seo";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteOrigin", () => {
  it("reads SITE_URL", () => {
    vi.stubEnv("SITE_URL", "https://greenlighthouse.example");
    expect(siteOrigin()).toBe("https://greenlighthouse.example");
  });

  it("strips a trailing slash so joined paths never double up", () => {
    vi.stubEnv("SITE_URL", "https://greenlighthouse.example/");
    expect(siteOrigin()).toBe("https://greenlighthouse.example");
  });

  it("falls back to localhost when unset, rather than emitting 'undefined' into a canonical", () => {
    vi.stubEnv("SITE_URL", "");
    expect(siteOrigin()).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  it("builds a locale-prefixed absolute URL", () => {
    vi.stubEnv("SITE_URL", "https://glh.example");
    expect(absoluteUrl("en", "/")).toBe("https://glh.example/en");
    expect(absoluteUrl("tr", "/")).toBe("https://glh.example/tr");
  });

  it("keeps nested paths intact", () => {
    vi.stubEnv("SITE_URL", "https://glh.example");
    expect(absoluteUrl("ru", "/industries")).toBe("https://glh.example/ru/industries");
  });
});

describe("alternatesFor", () => {
  it("self-canonicalizes each locale — TR must NOT canonical to EN", () => {
    vi.stubEnv("SITE_URL", "https://glh.example");
    expect(alternatesFor("tr", "/").canonical).toBe("https://glh.example/tr");
    expect(alternatesFor("en", "/").canonical).toBe("https://glh.example/en");
  });

  it("emits every locale plus x-default", () => {
    vi.stubEnv("SITE_URL", "https://glh.example");
    const { languages } = alternatesFor("en", "/");
    expect(languages).toEqual({
      en: "https://glh.example/en",
      tr: "https://glh.example/tr",
      ru: "https://glh.example/ru",
      "x-default": "https://glh.example/en",
    });
  });
});

describe("thinContentReason (FR42a's three triggers)", () => {
  it("returns null for a populated page", () => {
    expect(thinContentReason({ locale: "en", itemCount: 5 })).toBeNull();
  });

  it("flags an EMPTY page (zero primary items) — the PRD's worked example", () => {
    expect(thinContentReason({ locale: "en", itemCount: 0 })).toBe("empty");
  });

  it("flags a PLACEHOLDER route even when it would otherwise look populated", () => {
    expect(thinContentReason({ locale: "en", itemCount: 9, isPlaceholder: true })).toBe(
      "placeholder",
    );
  });

  it("flags a FALLBACK-ONLY page when every primary field fell back to EN", () => {
    expect(
      thinContentReason({ locale: "tr", itemCount: 4, fallbackFields: 4, totalFields: 4 }),
    ).toBe("fallback-only");
  });

  it("does NOT flag partial fallback — the threshold is ALL fields (story decision Q4)", () => {
    expect(
      thinContentReason({ locale: "tr", itemCount: 4, fallbackFields: 3, totalFields: 4 }),
    ).toBeNull();
  });

  it("never calls EN fallback-only — EN is the source language, not a fallback of itself", () => {
    expect(
      thinContentReason({ locale: "en", itemCount: 4, fallbackFields: 4, totalFields: 4 }),
    ).toBeNull();
  });

  it("prioritises placeholder over empty so the reason is stable", () => {
    expect(thinContentReason({ locale: "en", itemCount: 0, isPlaceholder: true })).toBe(
      "placeholder",
    );
  });
});

describe("robotsFor", () => {
  it("indexes a populated page", () => {
    expect(robotsFor({ locale: "en", itemCount: 3 })).toEqual({ index: true, follow: true });
  });

  it("noindexes a thin page but keeps FOLLOW so its links are still crawled", () => {
    expect(robotsFor({ locale: "en", itemCount: 0 })).toEqual({ index: false, follow: true });
  });
});

describe("allowsIndexing (robots.txt environment gate)", () => {
  it("fails CLOSED when unset — a staging container must not invite crawlers", () => {
    vi.stubEnv("SITE_ALLOW_INDEXING", "");
    expect(allowsIndexing()).toBe(false);
  });

  it("only opts in on an explicit true", () => {
    vi.stubEnv("SITE_ALLOW_INDEXING", "true");
    expect(allowsIndexing()).toBe(true);
    vi.stubEnv("SITE_ALLOW_INDEXING", "false");
    expect(allowsIndexing()).toBe(false);
    vi.stubEnv("SITE_ALLOW_INDEXING", "yes");
    expect(allowsIndexing()).toBe(false);
  });
});
