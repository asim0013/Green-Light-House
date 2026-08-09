import { Inter, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";

/**
 * The four DESIGN.md families (Story 1.5), in ONE place.
 *
 * Extracted in Story 1.9 because the app now has two documents that must look
 * identical: `[locale]/layout.tsx` and `app/global-not-found.tsx`. The latter
 * bypasses layouts entirely and has to declare its own `<html>`/`<body>`, so
 * without this module the four loaders — and the exact variable wiring the
 * `globals.css` token stacks depend on — would be duplicated and free to drift.
 *
 * Geist / Geist Mono have NO cyrillic subset, so their token stacks in globals.css
 * fall back to Inter / IBM Plex Mono (both cover cyrillic).
 */

// body voice — full latin/latin-ext/cyrillic; also the cyrillic fallback for headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

// heading voice — latin + latin-ext only (no cyrillic subset exists for Geist).
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "latin-ext"],
});

// mono / label voice (UPPERCASE kickers, chips, table headers) — no cyrillic subset.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

// data voice (model numbers, specs, quantities, dates, refs) — covers cyrillic, so
// it also serves as the cyrillic fallback for the mono/label stack.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
});

/** Every font variable plus the shared root classes — put this on `<html>`. */
export const HTML_CLASS = `${inter.variable} ${geist.variable} ${geistMono.variable} ${ibmPlexMono.variable} h-full antialiased`;

/** Shared `<body>` classes — column flex so children can claim the free height. */
export const BODY_CLASS = "flex min-h-full flex-col";
