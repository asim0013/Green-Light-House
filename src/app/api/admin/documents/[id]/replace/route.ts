import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { isStorableText } from "@/server/rfq/schema";
import { scanBuffer } from "@/lib/clamav";
import { putObject, deleteObject } from "@/lib/storage";
import { validateDocumentUpload, documentStorageKey } from "@/server/admin/documents/validate";
import { replaceDocumentFile } from "@/server/repositories/document";
import { revalidateTags } from "@/lib/revalidate";
import { TAGS } from "@/lib/cache-tags";
import type { MutationResult } from "@/server/admin/catalog/mutation";

/**
 * `POST /api/admin/documents/<id>/replace` — replace a document's FILE (FR25a).
 *
 * The stable public URL is unchanged: this uploads a NEW `docs/` object, repoints
 * `fileKey` + bumps `version`, then deletes the OLD object AFTER the repoint
 * commits (upload new → repoint row → delete old — so `/api/documents/<slug>`
 * always resolves to an existing object). Slug + associations untouched.
 */

function originAllowed(origin: string | null): boolean {
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(siteOrigin()).origin;
  } catch {
    return false;
  }
}
function fail(code: string, message: string, status: number) {
  const body: MutationResult<{ id: string }> = { ok: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(request.headers.get("origin")))
    return fail("forbidden", "Request blocked.", 403);
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthRequiredError)
      return fail("unauthorized", "Your session has expired. Sign in again.", 401);
    throw error;
  }

  const { id } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return fail("file_required", "Choose a PDF.", 400);

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
  if ((await scanBuffer(bytes)).status !== "clean") {
    return fail("scan_failed", "This file could not be accepted (failed a security scan).", 422);
  }

  const key = documentStorageKey(validation.format.extension);
  try {
    await putObject(key, bytes, validation.format.mime);
  } catch (error) {
    console.error("[documents] replace storage error:", error);
    return fail(
      "storage_unavailable",
      "Storage is temporarily unavailable. Try again shortly.",
      503,
    );
  }

  const result = await replaceDocumentFile(id, {
    fileKey: key,
    mime: validation.format.mime,
    sizeBytes: bytes.length,
  });
  if (!result) {
    await deleteObject(key).catch(() => {}); // document vanished — don't orphan the new object
    return fail("not_found", "That document no longer exists.", 404);
  }

  // Row now points at the new object — safe to remove the superseded one (D4).
  await deleteObject(result.oldFileKey).catch((error) => {
    console.error("[documents] failed to delete superseded object", result.oldFileKey, error);
  });
  revalidateTags([TAGS.documents]);
  const body: MutationResult<{ id: string }> = { ok: true, data: { id } };
  return NextResponse.json(body, { status: 200 });
}
