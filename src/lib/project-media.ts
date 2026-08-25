import type { Locale } from "@prisma/client";

/**
 * THE FROZEN `Project.media` SHAPE (Story 3.0).
 *
 * `Project.media` has been `Json @default("[]")` since Story 1.2 with no defined
 * structure, typed `unknown` in the repository, and empty in every seeded row —
 * a column with no contract and no consumer. Story 3.1 renders the project detail
 * page's image band, so the shape has to exist before then, and freezing it here
 * rather than there is what stops the first renderer becoming the de facto spec.
 *
 * NO MIGRATION: the column already exists and JSONB needs no schema change to
 * hold this. That is why AC8 is a type and a docstring, not SQL.
 */

/** Alt text per locale. EN is required as the fallback source (FR34a). */
export type ProjectMediaAlt = { en: string } & Partial<Record<Locale, string>>;

export interface ProjectMediaEntry {
  /**
   * Stable identifier within the project, used in the delivery URL. Not the
   * storage key: the key changes when Epic 4 replaces the file, and a URL that
   * changes on replacement breaks every link and cache entry pointing at it.
   */
  id: string;
  /**
   * Object-storage key, exactly as `Document.fileKey` works. Server-side only —
   * it must never reach the browser, which is half the reason delivery goes
   * through an app route rather than a public bucket URL.
   */
  storageKey: string;
  /** MIME type, allowlisted at parse time — see `SAFE_IMAGE_MIME`. */
  mime: string;
  /**
   * Alt text per locale, EN required. Alt is NOT the caption: it is announced
   * instead of the image and is invisible to sighted users, so an untranslated
   * alt gets the `lang` treatment but never a visible `FallbackNotice` — there is
   * nothing to attach a visible notice to. The visible caption is a separate,
   * authored field and does carry the notice.
   */
  alt: ProjectMediaAlt;
  /** Ascending. Ties broken by `id` so ordering is total and stable. */
  sort: number;
}

/**
 * The image types this project will serve.
 *
 * **SVG IS DELIBERATELY EXCLUDED, AND THIS IS A SECURITY BOUNDARY, NOT A
 * PREFERENCE.** Delivery is same-origin (see below), and an SVG is an XML
 * document that may carry `<script>`. Serving one from our own origin hands an
 * uploader stored XSS against every logged-in admin session Epic 4 will create.
 * Reject at the PARSE boundary, not at render: by render time the value has
 * already been trusted by whatever read it.
 */
export const SAFE_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/**
 * DELIVERY DECISION (AC8): an app route on the `/api/documents/[slug]` precedent,
 * NOT `next/image` with `images.remotePatterns`, and NOT a public bucket URL.
 *
 * Three reasons, in order of weight:
 *
 * 1. **The streaming route is already proven here.** Story 2.3 built
 *    `/api/documents/[slug]` over the same MinIO bucket: it is proxy-excluded,
 *    it holds credentials server-side, it answers conditional requests with a
 *    304, and it fails 503 rather than 404 when storage is down. A second
 *    delivery mechanism would need all of that re-proven.
 * 2. **The bucket has no public policy and should keep none.** Making project
 *    photos publicly readable to satisfy `remotePatterns` would also expose
 *    every other object in the bucket unless a second bucket is introduced.
 * 3. **It keeps `storageKey` server-side**, which is what makes the SVG gate and
 *    any future access rule enforceable at all.
 *
 * ⚠️ CORRECTION TO THE EPICS' STATED RATIONALE. The epics justify this by saying
 * an unconfigured remote `src` "500s the page". That is HALF WRONG: `next/image`'s
 * host validation is a dev/test-time guard, so in production the failure is a
 * broken image, not a crash. The decision above stands on its own three grounds —
 * do not repeat the incorrect one.
 */
export function projectMediaHref(projectSlug: string, mediaId: string): string {
  return `/api/projects/${encodeURIComponent(projectSlug)}/media/${encodeURIComponent(mediaId)}`;
}

function isSafeMime(value: unknown): value is (typeof SAFE_IMAGE_MIME)[number] {
  return typeof value === "string" && (SAFE_IMAGE_MIME as readonly string[]).includes(value);
}

/** Narrow one raw JSONB element. Anything not matching the contract is dropped. */
export function isProjectMediaEntry(value: unknown): value is ProjectMediaEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || entry.id === "") return false;
  if (typeof entry.storageKey !== "string" || entry.storageKey === "") return false;
  if (!isSafeMime(entry.mime)) return false;
  if (typeof entry.sort !== "number" || !Number.isFinite(entry.sort)) return false;
  const alt = entry.alt;
  if (typeof alt !== "object" || alt === null) return false;
  return typeof (alt as Record<string, unknown>).en === "string";
}

/**
 * Parse `Project.media` from JSONB into the frozen shape, sorted.
 *
 * Returns `[]` for anything unparseable rather than throwing: a malformed media
 * blob must degrade to "this project has no photos" — a state the design already
 * draws — never to a 500 on a public page.
 */
export function parseProjectMedia(value: unknown): ProjectMediaEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isProjectMediaEntry)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}
