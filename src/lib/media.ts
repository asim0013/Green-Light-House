/**
 * MEDIA LIBRARY — same-origin delivery href (Story 4.5, FR37).
 *
 * Assets are served through the app route `/api/media/[id]`, NOT a bucket URL and
 * NOT `next/image` + `images.remotePatterns` (see the decision recorded on
 * `src/lib/project-media.ts` and the `MediaAsset` model docstring). The `/`-rooted
 * path is exactly what the existing next/image guards accept unchanged
 * (`HomeManufacturers` renders `logoUrl` only when it `startsWith("/")`), so the
 * storageKey stays server-side and the bucket stays private.
 *
 * This module is CLIENT-SAFE (no server imports) so forms, the picker and the
 * delivery route can all share the one href shape.
 */

/** A media asset as a picker option — the client-safe shape the repo's
 *  `MediaAssetOption` structurally satisfies (so the picker imports no server code). */
export interface MediaPickerOption {
  id: string;
  href: string;
  kind: "image" | "video";
  label: string;
}

/** The delivery href for an asset. Stored verbatim in `Manufacturer.logoUrl`. */
export function mediaHref(id: string): string {
  return `/api/media/${encodeURIComponent(id)}`;
}

/**
 * Recover an asset id from a stored `mediaHref` value (e.g. a manufacturer's
 * `logoUrl`), or `null` if the value is not a media href. Used by the delete
 * reference-guard to tell whether a `logoUrl` points at the asset being deleted.
 */
export function mediaIdFromHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\/api\/media\/([^/?#]+)$/.exec(value);
  return match ? decodeURIComponent(match[1]) : null;
}
