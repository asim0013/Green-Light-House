import { describe, it, expect } from "vitest";
import { ADMIN_NAV, isNavItemActive, type AdminNavItem } from "./nav";

/**
 * The admin nav config + active-state logic (Story 4.2, AC3). Pure — the sidebar
 * component's active highlighting and link/disabled split both derive from these.
 */
const byKey = (k: string) => ADMIN_NAV.find((i) => i.key === k) as AdminNavItem;

describe("ADMIN_NAV config", () => {
  it("has unique keys and a Dashboard that is live", () => {
    const keys = ADMIN_NAV.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ADMIN_NAV.length).toBeGreaterThanOrEqual(7);
    // Dashboard is the one module THIS story builds — it must be a live link.
    expect(byKey("dashboard").available).toBe(true);
    expect(byKey("dashboard").path).toBe("");
  });

  it("every non-dashboard item maps to a later story and is not yet available", () => {
    // Guards the "visible but inert" default: a module must not be linkable
    // before its story ships. Each module story flips its OWN item here.
    for (const item of ADMIN_NAV.filter((i) => i.key !== "dashboard")) {
      expect(item.available, `${item.key} should be inert until its story ships`).toBe(false);
      expect(item.story).toMatch(/^4\.\d/);
    }
  });
});

describe("isNavItemActive", () => {
  it("matches Dashboard ONLY on the exact /admin", () => {
    // P5: drop the `path === ""` special case and Dashboard lights up on every
    // /admin/* path (it startsWith /admin).
    expect(isNavItemActive(byKey("dashboard"), "/admin")).toBe(true);
    expect(isNavItemActive(byKey("dashboard"), "/admin/catalog")).toBe(false);
  });

  it("matches a module on its own subtree, not the dashboard", () => {
    expect(isNavItemActive(byKey("catalog"), "/admin/catalog")).toBe(true);
    expect(isNavItemActive(byKey("catalog"), "/admin/catalog/new")).toBe(true);
    expect(isNavItemActive(byKey("catalog"), "/admin")).toBe(false);
    expect(isNavItemActive(byKey("catalog"), "/admin/catalogue")).toBe(false); // not a segment boundary
  });
});
