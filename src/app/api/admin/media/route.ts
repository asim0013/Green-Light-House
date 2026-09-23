import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { isStorableText } from "@/server/rfq/schema";
import { scanBuffer } from "@/lib/clamav";
import { putObject } from "@/lib/storage";
import { validateMediaUpload, mediaStorageKey } from "@/server/admin/media/validate";
import { createMediaAsset } from "@/server/repositories/media";
import { revalidateTags } from "@/lib/revalidate";
import { TAGS } from "@/lib/cache-tags";

/**
 * `POST /api/admin/media` — media library upload (Story 4.5, AC2).
 *
 * `/api/admin/*` is EXCLUDED from the proxy matcher, so this handler owns its
 * guards, in the same order as `/api/admin/login` and `/api/rfq`:
 *   1. Origin check → 403 (canonical-origin equality; absent allowed).
 *   2. `requireAdmin()` → 401 (defence-in-depth; the matcher does not cover /api).
 *   3. Validate the file (size / allowlist / magic; SVG refused at the gate).
 *   4. `scanBuffer` → any non-`clean` verdict is 422, and NOTHING is stored:
 *      infected and failed collapse to one key (no malware oracle), exactly like
 *      the RFQ path. The scan runs BEFORE `putObject`, so an infected byte never
 *      reaches the bucket — FR32a "scanned before storage" made literal.
 *   5. Store under `media/<uuid>.<ext>`, then persist the row, then purge `media`.
 *
 * Errors return `{ ok: false, key }` where `key` is a stable error key the
 * uploader maps to copy via `errorText` (`CatalogFormKit`). Success returns
 * `{ ok: true, id }`.
 */

function originAllowed(origin: string | null): boolean {
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(siteOrigin()).origin;
  } catch {
    return false;
  }
}

function fail(key: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, key }, { status });
}

export async function POST(request: Request) {
  if (!originAllowed(request.headers.get("origin"))) return fail("forbidden", 403);

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthRequiredError) return fail("unauthorized", 401);
    throw error;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("fileRequired", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateMediaUpload(file.name, bytes, isStorableText);
  if (!validation.ok) return fail(validation.key, 422);
  const { format } = validation;

  // Scan BEFORE any upload. Infected and failed are one key deliberately.
  const scan = await scanBuffer(bytes);
  if (scan.status !== "clean") return fail("scanFailed", 422);

  const key = mediaStorageKey(format.extension);
  try {
    await putObject(key, bytes, format.mime);
  } catch (error) {
    console.error("[media] upload storage error:", error);
    return fail("storageUnavailable", 503);
  }

  // Optional EN alt supplied at upload; otherwise alt is authored on the edit page.
  const altRaw = form.get("alt");
  const alt = typeof altRaw === "string" ? altRaw.trim() : "";
  const translations = alt && isStorableText(alt) ? [{ locale: "en" as const, alt }] : undefined;

  const { id } = await createMediaAsset({
    storageKey: key,
    kind: format.kind,
    mime: format.mime,
    originalName: file.name.trim(),
    sizeBytes: bytes.length,
    translations,
  });

  revalidateTags([TAGS.media]);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
