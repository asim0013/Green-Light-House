import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectListItem } from "@/server/repositories/project";
import type { SlaContent } from "@/server/repositories/sla";
import { slaTextFor } from "../../../scripts/sla-fixtures";

/**
 * Hero chrome + proof card (Story 1.7, AC1/AC2/AC5/AC6).
 *
 * Runs with no server and no DB, so the hero's guarantees stay proven even when
 * the e2e skips on a down database (the Story-1.6 review lesson). Every field the
 * card reads is nullable in the schema, so the null paths are asserted as
 * deliberately as the populated ones.
 */

vi.mock("next-intl", () => ({
  // Echoes the key, and appends interpolated values so placeholder-bearing
  // messages (e.g. `deliveredOn: "Delivered {date}"`) remain assertable.
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
  useLocale: () => "en",
  useFormatter: () => ({ dateTime: () => "June 2024" }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const props = { ...rest };
    delete props.locale;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const { HomeHero } = await import("./HomeHero");

const FULL: ProjectListItem = {
  id: "p1",
  slug: "lng-terminal-fire-gas-upgrade",
  title: "LNG terminal fire & gas upgrade",
  description: null,
  outcome: "142 field devices, ATEX Zone 1, delivered in six weeks.",
  isFallback: false,
  descriptionIsFallback: false,
  outcomeIsFallback: false,
  industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
  deliveredAt: new Date("2024-06-01T00:00:00.000Z"),
  media: [],
};

/** Mirrors the seeded `refinery-gas-detection-retrofit`: title only. */
const BARE: ProjectListItem = {
  ...FULL,
  slug: "refinery-gas-detection-retrofit",
  title: "Refinery gas-detection retrofit",
  outcome: null,
  industry: null,
  deliveredAt: null,
};

/**
 * The response process (Story 3.5). REAL COPY, not the key-echoing mock: the
 * SLA stopped being a `messages` key and became content, so a test that asserts
 * the key name would assert nothing about what a buyer reads.
 */
const SLA: SlaContent = { ...slaTextFor("en"), isFallback: false };

describe("HomeHero — always-on chrome", () => {
  it("renders exactly one h1", () => {
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
  });

  it("renders both co-equal CTAs: the RFQ link and a tel: action", () => {
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html).toContain('href="/rfq"');
    expect(html).toContain('href="tel:');
  });

  it("links the proof card to THE PROJECT'S OWN detail page (Story 3.1)", () => {
    // BOUND TO THE SLUG (3.1 review): nothing anywhere pinned the href suffix, so
    // a wrong-slug link would survive every gate — the target soft-404s with a
    // 200, and EXPERIENCE.md:97 calls this doorway the site's most important
    // interaction. The e2e pins the same URL against the live seed.
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html).toContain(`href="/projects/${FULL.slug}"`);
  });

  it("keeps the visible phone number inside the accessible name (WCAG 2.5.3)", () => {
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    const tel = html.match(/<a\b[^>]*href="tel:[^"]*"[^>]*>/)?.[0] ?? "";
    expect(tel.match(/aria-label="([^"]*)"/)?.[1] ?? "").toContain("+90");
  });

  it("renders the SLA and no-prices lines, and not in `muted`", () => {
    // Positive assertions first: the bare `not.toContain("text-muted")` guard
    // passed with BOTH copy lines deleted, so it proved nothing on its own.
    // EXPERIENCE.md: the SLA is load-bearing copy and must be present; `muted` is
    // 3.10:1 on white and cannot carry it.
    //
    // ⚠️ ASSERTS THE COPY, NOT THE KEY (Story 3.5). This used to assert
    // `toContain("sla")` — the KEY NAME, which only appeared because the
    // next-intl mock above echoes keys. Once the SLA moved into the content
    // model that string stopped rendering at all, and the assertion had been
    // pinning the mock rather than the hero for its whole life.
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html).toContain(SLA.summary);
    expect(html).toContain("noPrices");
    expect(html).not.toContain("text-muted");
  });

  it("renders NO SLA block at all when the content model is empty", () => {
    // AC8's degenerate branch on a real surface. The block is conditional
    // because it is ruled: rendering the `border-t` above nothing would leave a
    // stray hairline where the promise used to be. P5: drop the `{sla && …}`
    // guard and this reddens on the border class.
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={null} />);
    expect(html).not.toContain(SLA.summary);
    // `mt-7 border-t`, not `border-border-subtle pt-5`: the proof card carries
    // that second string too, so asserting it could never have failed.
    expect(html).not.toContain("mt-7 border-t");
    // …and the rest of the hero is untouched.
    expect(html).toContain('href="/rfq"');
    expect(html).toContain("noPrices");
  });
});

describe("HomeHero — proof card", () => {
  it("shows the project title, outcome, industry and delivered date", () => {
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html).toContain("LNG terminal fire &amp; gas upgrade");
    expect(html).toContain("142 field devices, ATEX Zone 1, delivered in six weeks.");
    expect(html).toContain("Oil &amp; Gas");
    expect(html).toContain("June 2024");
  });

  it("titles the project as an h2, not a second h1", () => {
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html).toContain("<h2");
  });

  it("omits the outcome, industry and date rows when those fields are null", () => {
    const full = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    const bare = renderToStaticMarkup(<HomeHero project={BARE} sla={SLA} />);
    expect(bare).toContain("Refinery gas-detection retrofit");
    // The outcome text must actually be ABSENT — the original test never checked
    // it, so a card that always rendered the outcome would have passed.
    expect(full).toContain("142 field devices");
    expect(bare).not.toContain("142 field devices");
    expect(bare).not.toContain("June 2024");
    expect(bare).not.toContain("deliveredOn");
    expect(bare).not.toContain("Oil &amp; Gas");
  });

  it("marks fallen-back project text with lang=en and the shown-in-English notice", () => {
    const html = renderToStaticMarkup(
      <HomeHero project={{ ...FULL, isFallback: true }} sla={SLA} />,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("shownInEnglish");
  });

  it("does not mark content that is in the requested locale", () => {
    const html = renderToStaticMarkup(<HomeHero project={FULL} sla={SLA} />);
    expect(html).not.toContain("shownInEnglish");
  });
});

describe("HomeHero — empty state (AC5)", () => {
  it("renders the defined empty state instead of the card when there is no project", () => {
    const html = renderToStaticMarkup(<HomeHero project={null} sla={SLA} />);
    expect(html).toContain("proofEmpty");
  });

  it("still renders the h1 and both CTAs with no project", () => {
    const html = renderToStaticMarkup(<HomeHero project={null} sla={SLA} />);
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).toContain('href="/rfq"');
    expect(html).toContain('href="tel:');
  });
});
