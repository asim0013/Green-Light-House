import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { isStorableText, issueDetails } from "@/server/rfq/schema";
import { scanBuffer } from "@/lib/clamav";
import { putObject, deleteObject } from "@/lib/storage";
import { validateDocumentUpload, documentStorageKey } from "@/server/admin/documents/validate";
import { documentCreateSchema, documentTitleRows } from "@/server/admin/documents/schema";
import { createDocument } from "@/server/repositories/document";
import { isUniqueViolation } from "@/server/admin/catalog/db-errors";
import { revalidateTags } from "@/lib/revalidate";
import { TAGS } from "@/lib/cache-tags";
import type { MutationResult } from "@/server/admin/catalog/mutation";

/**
 * `POST /api/admin/documents` — create a document (Story 4.6, AC1).
 *
 * Multipart route (a File is not zod-parseable, so this can't be a
 * `withAdminMutation` action). Guard order matches `/api/admin/media`:
 * Origin → requireAdmin → validate METADATA (zod) → validate + SCAN + store the
 * file under `docs/` → create the row. Metadata is validated BEFORE the file is
 * stored so a bad-metadata request never orphans an object; a duplicate-slug race
 * (P2002) after storage deletes the just-stored object. Returns the
 * `MutationResult` envelope so the client reuses `useCatalogSubmit`.
 *
 * `slug` is the stable public identity (FR25a) — set here at create, never edited.
 * Purge `documents` alone: all three document readers carry that tag.
 */

function originAllowed(origin: string | null): boolean {
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(siteOrigin()).origin;
  } catch {
    return false;
  }
}

function fail(
  code: string,
  message: string,
  status: number,
  details?: { path: string; key: string }[],
) {
  const body: MutationResult<{ id: string }> = { ok: false, error: { code, message, details } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  if (!originAllowed(request.headers.get("origin")))
    return fail("forbidden", "Request blocked.", 403);
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthRequiredError)
      return fail("unauthorized", "Your session has expired. Sign in again.", 401);
    throw error;
  }

  const form = await request.formData();

  // 1. Metadata first — a bad form never orphans a stored object.
  const parsed = documentCreateSchema.safeParse({
    slug: form.get("slug"),
    type: form.get("type"),
    isPublic: form.get("isPublic"),
    productId: form.get("productId"),
    manufacturerId: form.get("manufacturerId"),
    industryIds: form.getAll("industryIds"),
    titleEn: form.get("titleEn"),
    titleTr: form.get("titleTr"),
    titleRu: form.get("titleRu"),
  });
  if (!parsed.success) {
    return fail(
      "validation_failed",
      "Please fix the highlighted fields.",
      422,
      issueDetails(parsed.error),
    );
  }
  const input = parsed.data;

  // 2. File: validate → scan → store.
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("file_required", "Choose a PDF to upload.", 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateDocumentUpload(file.name, bytes, isStorableText);
  if (!validation.ok) {
    const messages: Record<string, string> = {
      invalid: "That filename can't be stored.",
      unsupportedType: "Only PDF files are accepted.",
      fileTooLarge: "File is too large.",
      fileCorrupt: "This file is not a valid PDF.",
    };
    return fail(validation.key, messages[validation.key], 422);
  }
  const scan = await scanBuffer(bytes);
  if (scan.status !== "clean") {
    return fail("scan_failed", "This file could not be accepted (failed a security scan).", 422);
  }

  const key = documentStorageKey(validation.format.extension);
  try {
    await putObject(key, bytes, validation.format.mime);
  } catch (error) {
    console.error("[documents] upload storage error:", error);
    return fail(
      "storage_unavailable",
      "Storage is temporarily unavailable. Try again shortly.",
      503,
    );
  }

  // 3. Create the row; a duplicate slug after storage deletes the orphan.
  try {
    const { id } = await createDocument({
      slug: input.slug,
      type: input.type,
      fileKey: key,
      mime: validation.format.mime,
      sizeBytes: bytes.length,
      isPublic: input.isPublic,
      productId: input.productId ?? null,
      manufacturerId: input.manufacturerId ?? null,
      industryIds: input.industryIds,
      translations: documentTitleRows(input),
    });
    revalidateTags([TAGS.documents]);
    const body: MutationResult<{ id: string }> = { ok: true, data: { id } };
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    await deleteObject(key).catch(() => {}); // best-effort: don't orphan on dup slug
    if (isUniqueViolation(error, "slug")) {
      return fail("slug_taken", "That slug is already in use.", 409, [
        { path: "slug", key: "slugInvalid" },
      ]);
    }
    throw error;
  }
}
