import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Story 3.1, AC6/AC7 — the cache CONTRACT of the project detail read.
 *
 * ⚠️ WHY THIS FILE EXISTS RATHER THAN AN e2e REVALIDATE CHECK. The obvious test
 * for "the `project:<slug>` purge works" is to POST that tag to `/api/revalidate`
 * and assert a 200 — and that assertion is **GREEN TODAY, BEFORE ANY CHANGE**:
 * `isKnownTag` has always accepted the `project:` prefix, so the endpoint has
 * always returned 200 while purging nothing, because zero cached reads carried
 * the tag. A test that passes before and after the fix proves nothing.
 *
 * What actually had to change is the TAG ARRAY the read registers, so that is
 * what this asserts, at the only boundary where it is observable.
 *
 * `vi.mock` is hoisted file-wide, which is why this is a separate file from the
 * pure-mapper tests in `project.test.ts`.
 */

const cached = vi.fn();
vi.mock("@/lib/cache", () => ({ cached: (...args: unknown[]) => cached(...args) }));
// The detail read must never reach Postgres in this file: `cached` is stubbed to
// return a hit, so the uncached fallthrough is not taken.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { getProjectBySlug } = await import("./project");

const HIT = {
  id: "p1",
  slug: "lng-terminal-fire-gas-upgrade",
  title: "LNG terminal fire & gas upgrade",
  description: null,
  outcome: null,
  isFallback: false,
  industry: { slug: "oil-gas", name: "Oil & Gas" },
  deliveredAt: "2024-06-01T00:00:00.000Z" as unknown as Date,
  media: [],
  products: [],
};

beforeEach(() => {
  cached.mockReset();
  cached.mockResolvedValue(HIT);
});

describe("getProjectBySlug — cache contract", () => {
  it("carries BOTH `project:<slug>` and `projects`", async () => {
    await getProjectBySlug("lng-terminal-fire-gas-upgrade", "en");

    const tags = cached.mock.calls[0]?.[2] as string[];
    // Asserted as a SET, not a prefix match: dropping either tag must fail. The
    // per-entity tag is what an admin sends on publish; the collection tag is what
    // keeps a catalogue-wide purge reaching detail pages.
    expect([...tags].sort()).toEqual(["project:lng-terminal-fire-gas-upgrade", "projects"]);
  });

  it("keys the entry by the SAME slug the tag names, plus the locale", async () => {
    await getProjectBySlug("refinery-gas-detection-retrofit", "tr");

    const key = cached.mock.calls[0]?.[1] as string[];
    expect(key).toContain("refinery-gas-detection-retrofit");
    expect(key).toContain("tr");
    // The entry's inputs must match its key — `cache.ts`'s rule, and the one the
    // 2.4 review found violated for products (an id-keyed entry queried by the
    // caller's slug let one slug poison another's read after a rename).
    const tag = (cached.mock.calls[0]?.[2] as string[]).find((t) => t.startsWith("project:"));
    expect(tag).toBe("project:refinery-gas-detection-retrofit");
  });

  it("re-hydrates `deliveredAt` — the cache round-trips a Date to an ISO STRING", async () => {
    // The silent bug this guards: `format.dateTime` given a string renders the raw
    // "2024-06-01T00:00:00.000Z" instead of "June 2024". `rehydrateDates` carries
    // the same warning for the LIST reads; this is the second read it warned about.
    const project = await getProjectBySlug("lng-terminal-fire-gas-upgrade", "en");
    expect(project?.deliveredAt).toBeInstanceOf(Date);
    expect(project?.deliveredAt?.getUTCFullYear()).toBe(2024);
  });

  it("preserves a null deliveredAt rather than coercing it to the epoch", async () => {
    cached.mockResolvedValue({ ...HIT, deliveredAt: null });
    const project = await getProjectBySlug("refinery-gas-detection-retrofit", "en");
    expect(project?.deliveredAt).toBeNull();
  });
});
