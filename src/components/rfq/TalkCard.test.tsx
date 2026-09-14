import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE } from "@/config/site";
import { routing } from "@/i18n/routing";

/**
 * The shared talk card (Story 3.6 — AC3, AC4; §H #5–#8).
 *
 * ⚠️ THIS FILE REPLACES 3.8's "the extraction changed nothing" byte-baseline.
 * That test pinned `TalkCard` to the markup `RfqRail` produced at `2fd608c`,
 * ON PURPOSE, so that 3.8's extraction could not silently alter the card. Story
 * 3.6 is the story that DOES alter it — the number becomes the largest element
 * and a `tel:` target, and both anchors take an explicit floor. So the baseline
 * is retired and its guarantees re-expressed as the properties 3.6 asserts,
 * each with the mutation (§H) that must redden it.
 *
 * ⚠️ THE MOCK IS NAMESPACE-AWARE, and that is load-bearing. `TalkCard` now reads
 * TWO namespaces — `Rfq` for its own copy and `Nav` for the shared phone label —
 * and AC4 turns on which prefix each anchor uses. Rendering `namespace.key` keeps
 * the namespace part of every assertion, so repointing a key is visible here.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const { TalkCard } = await import("./TalkCard");

/** All `<a>` elements as { attrs, visibleText }. */
function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1],
    visibleText: m[2].replace(/<[^>]*>/g, "").trim(),
  }));
}
const ariaLabel = (attrs: string) => attrs.match(/aria-label="([^"]*)"/)?.[1] ?? "";
const pxOf = (fragment: string) => Number(fragment.match(/text-\[(\d+)px\]/)?.[1] ?? "0");

describe("TalkCard — the phone is co-equal (AC3)", () => {
  it("renders BOTH the number and the button as tel: targets (§H #6)", () => {
    // P5: revert the number from an `<a>` back to a `<p>` and this reddens.
    const html = renderToStaticMarkup(<TalkCard />);
    const tels = anchors(html).filter((a) => a.attrs.includes(`tel:${SITE.phone}`));
    expect(tels).toHaveLength(2);
  });

  it("sets the number in mono as the LARGEST element in its column (§H #5)", () => {
    // The number's own anchor is the mono one; the button carries the Phone icon.
    // P5: restore `text-[13px]` on the number and this reddens (13 < 17 heading).
    const html = renderToStaticMarkup(<TalkCard />);
    const numberAnchor = anchors(html).find(
      (a) => a.attrs.includes(`tel:${SITE.phone}`) && a.attrs.includes("font-data"),
    );
    expect(numberAnchor, "no mono number anchor").toBeTruthy();
    const headingPx = pxOf(html.match(/<h2\b[^>]*>/)?.[0] ?? "");
    const numberPx = pxOf(numberAnchor!.attrs);
    expect(headingPx).toBe(17);
    expect(numberPx).toBeGreaterThan(headingPx);
    expect(numberAnchor!.visibleText).toBe(SITE.phoneDisplay);
    expect(numberAnchor!.attrs).toContain('translate="no"'); // machine data, not prose
  });

  it("clears the 44px floor on both tel: anchors with an explicit min-h-11 (AC2)", () => {
    const html = renderToStaticMarkup(<TalkCard />);
    const tels = anchors(html).filter((a) => a.attrs.includes(`tel:${SITE.phone}`));
    for (const a of tels) expect(a.attrs).toContain("min-h-11");
  });
});

describe("TalkCard — one label rule, applied here too (AC4, WCAG 2.5.3)", () => {
  it("every tel: anchor's accessible name CONTAINS its visible label (§H #7)", () => {
    // 2.5.3 (Label in Name). P5: give the button `Nav.phoneLabel` while it
    // visibly reads `Rfq.talkCta` and this reddens — the aria-label would no
    // longer contain the visible label.
    const html = renderToStaticMarkup(<TalkCard />);
    const tels = anchors(html).filter((a) => a.attrs.includes(`tel:${SITE.phone}`));
    for (const a of tels) {
      expect(ariaLabel(a.attrs), `accessible name must contain "${a.visibleText}"`).toContain(
        a.visibleText,
      );
    }
  });

  it("applies the formula: number link uses Nav.phoneLabel, button uses Rfq.talkCta", () => {
    // The number link's visible label is the number, so it takes the 14-site
    // majority prefix `Nav.phoneLabel`; the button's visible label is text, so it
    // keeps `Rfq.talkCta`. Neither mints a third convention.
    const html = renderToStaticMarkup(<TalkCard />);
    expect(html).toContain(`aria-label="Nav.phoneLabel: ${SITE.phoneDisplay}"`);
    expect(html).toContain(`aria-label="Rfq.talkCta: ${SITE.phoneDisplay}"`);
  });

  it('"Talk to an engineer" is RETIRED — it exists in no catalogue', () => {
    // The minority canvas spelling (2 frames), in no `messages/*.json`. Minting
    // it would be the forbidden third convention. Swept structurally so it cannot
    // creep back in via a future copy edit.
    for (const locale of routing.locales) {
      const raw = readFileSync(`messages/${locale}.json`, "utf8");
      expect(raw, `${locale}.json minted a retired label`).not.toContain("Talk to an engineer");
      expect(raw).not.toContain("mühendisle konuş"); // TR verb form
    }
  });
});

describe("TalkCard — chrome and mounts unchanged", () => {
  it("renders the phone as CHROME — the placeholder included (AC1's exemption)", () => {
    // /contact's configured-channels rule governs the NEW channels; the phone is
    // chrome and shows exactly what the header, hero, every industry/project page
    // and the 404 already show. Guarding it here would make /contact the only
    // surface hiding it — the inconsistency, not the fix.
    const html = renderToStaticMarkup(<TalkCard />);
    expect(html).toContain(`tel:${SITE.phone}`);
    expect(html).toContain(SITE.phoneDisplay);
  });

  it("is MOUNTED by both surfaces AC8 names — /rfq and /contact (§H #8)", () => {
    // Every render test above mounts the component in isolation, so all stay
    // green on a page that no longer uses it. Structural because both mount sites
    // are server components a unit test cannot mount.
    // P5: delete either mount and this reddens, naming the file.
    const MOUNTS = ["src/components/rfq/RfqRail.tsx", "src/app/[locale]/(public)/contact/page.tsx"];
    const missing = MOUNTS.filter((file) => !/<TalkCard\b/.test(readFileSync(file, "utf8")));
    expect(missing, "a surface AC8 names no longer mounts TalkCard").toEqual([]);
  });
});
