import { describe, it, expect } from "vitest";
import { resolveLeadsDatabaseUrl, leadsStoreIsSeparate } from "./leads-db-url";

/**
 * The leads-store URL resolver (Story 5.3). A misread here silently sends personal
 * data to the wrong database, so every fallback edge is pinned.
 */
const MAIN = "postgresql://glh:glh@eu-db:5432/greenlighthouse";
const RU = "postgresql://glh:glh@ru-db:5432/glh_leads";

describe("resolveLeadsDatabaseUrl", () => {
  it("falls back to DATABASE_URL when LEADS_DATABASE_URL is unset", () => {
    expect(resolveLeadsDatabaseUrl({ DATABASE_URL: MAIN })).toBe(MAIN);
  });

  it("falls back for an EMPTY or whitespace value (a blank .env line)", () => {
    // P5: change `leads ? leads : …` to `??` and the "" case reddens.
    expect(resolveLeadsDatabaseUrl({ DATABASE_URL: MAIN, LEADS_DATABASE_URL: "" })).toBe(MAIN);
    expect(resolveLeadsDatabaseUrl({ DATABASE_URL: MAIN, LEADS_DATABASE_URL: "   " })).toBe(MAIN);
  });

  it("uses LEADS_DATABASE_URL (trimmed) when set", () => {
    expect(resolveLeadsDatabaseUrl({ DATABASE_URL: MAIN, LEADS_DATABASE_URL: ` ${RU} ` })).toBe(RU);
  });
});

describe("leadsStoreIsSeparate", () => {
  it("is false when unset, blank, or pointing at the same database", () => {
    expect(leadsStoreIsSeparate({ DATABASE_URL: MAIN })).toBe(false);
    expect(leadsStoreIsSeparate({ DATABASE_URL: MAIN, LEADS_DATABASE_URL: "  " })).toBe(false);
    expect(leadsStoreIsSeparate({ DATABASE_URL: MAIN, LEADS_DATABASE_URL: MAIN })).toBe(false);
  });

  it("is true only for a different database", () => {
    expect(leadsStoreIsSeparate({ DATABASE_URL: MAIN, LEADS_DATABASE_URL: RU })).toBe(true);
  });
});
