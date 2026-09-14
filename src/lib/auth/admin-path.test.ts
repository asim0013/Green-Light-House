import { describe, it, expect } from "vitest";
import { protectedAdminLocale } from "./admin-path";
import { routing } from "@/i18n/routing";

/**
 * The proxy guard's SCOPE (Story 4.1, AC1) — the load-bearing security decision:
 * exactly which paths require a session. Falsifiable in isolation so a scope
 * regression cannot hide behind a middleware that "looks right".
 */
describe("protectedAdminLocale — the admin guard scope", () => {
  it("protects /[locale]/admin and everything under it", () => {
    // P5: change the regex to miss the bare `/admin` and the first line reddens.
    expect(protectedAdminLocale("/en/admin")).toBe("en");
    expect(protectedAdminLocale("/tr/admin/")).toBe("tr");
    expect(protectedAdminLocale("/ru/admin/leads")).toBe("ru");
    expect(protectedAdminLocale("/en/admin/catalog/products")).toBe("en");
  });

  it("EXEMPTS the login/forgot/reset pages — gating them would lock the admin out", () => {
    // P5: drop the auth-subpath exemption and these become "en"/"tr", so the
    // guard would redirect the login page to itself (a loop).
    for (const p of ["/login", "/forgot", "/reset"]) {
      expect(protectedAdminLocale(`/en/admin${p}`)).toBeNull();
      expect(protectedAdminLocale(`/en/admin${p}/anything`)).toBeNull();
    }
  });

  it("does NOT protect public paths or look-alikes", () => {
    expect(protectedAdminLocale("/en")).toBeNull();
    expect(protectedAdminLocale("/en/products")).toBeNull();
    expect(protectedAdminLocale("/en/adminfoo")).toBeNull(); // not a segment boundary
    expect(protectedAdminLocale("/admin")).toBeNull(); // no locale prefix
    expect(protectedAdminLocale("/fr/admin")).toBeNull(); // unsupported locale
  });

  it("covers every configured locale (no hard-coded triple)", () => {
    // If a fourth locale is added to routing, the guard must extend automatically.
    expect(routing.locales.length).toBeGreaterThanOrEqual(3);
    for (const locale of routing.locales) {
      expect(protectedAdminLocale(`/${locale}/admin`)).toBe(locale);
    }
  });
});
