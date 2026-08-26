/**
 * Site-wide config (Story 1.6). The phone number is a PLACEHOLDER for GLH to set.
 * Nav/footer hrefs are locale-relative (next-intl `<Link>` adds the locale) and
 * point at canonical routes (chrome-first). BUILT: Industries (2.1), Products
 * (2.2), Services (2.6), Projects (3.1), RFQ (3.2), and `/privacy` as 3.2's
 * noindex consent stub (5.1 replaces it). Still rendering the localized 404
 * until their stories land: About, Terms, Cookies (Epic 5).
 */
export const SITE = {
  // TODO(GLH): replace with the real number. `phone` is the tel: href (E.164),
  // `phoneDisplay` is the human label.
  phone: "+902120000000",
  phoneDisplay: "+90 212 000 00 00",
  /** Where the primary "Request Project Quote" CTA points (built in Story 3.2). */
  rfqHref: "/rfq",
} as const;

/** Primary nav — industry-led (EXPERIENCE.md §IA). Labels resolve from messages `Nav`. */
export const NAV_ITEMS = [
  { key: "industries", href: "/industries" },
  { key: "products", href: "/products" },
  { key: "projects", href: "/projects" },
  { key: "services", href: "/services" },
  { key: "about", href: "/about" },
] as const;

/** Footer legal slots. `/privacy` is live since 3.2 (a noindex stub 5.1
 * replaces); `/terms` and `/cookies` 404 until 5.1. Labels from `Footer`. */
export const FOOTER_LEGAL = [
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
  { key: "cookies", href: "/cookies" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
export type FooterLegalItem = (typeof FOOTER_LEGAL)[number];
