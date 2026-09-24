import type { Locale, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { deleteObject } from "@/lib/storage";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface CertificateListItem {
  id: string;
  slug: string;
  title: string;
  /** True when the title fell back to EN. */
  isFallback: boolean;
  /** For the format+size text on download links (Story 2.3). */
  mime: string | null;
  sizeBytes: number | null;
}

/**
 * The minimum structural shape `toCertificateListItem` consumes — narrower than
 * Prisma's row type so the mapper is unit-testable with plain objects.
 */
export interface DocumentRow {
  id: string;
  slug: string;
  mime?: string | null;
  sizeBytes?: number | null;
  translations: readonly { locale: Locale; title: string }[];
}

/** Resolve one document row for `locale` (EN fallback, FR34a). */
export function toCertificateListItem(document: DocumentRow, locale: Locale): CertificateListItem {
  const t = resolveTranslation(document.translations, locale);
  return {
    id: document.id,
    slug: document.slug,
    title: t?.value.title ?? document.slug,
    isFallback: t?.isFallback ?? false,
    mime: document.mime ?? null,
    sizeBytes: document.sizeBytes ?? null,
  };
}

/**
 * Public certificates applicable to `industrySlug`, for the Applicable-certificates
 * block (Story 2.1).
 *
 * TWO THINGS TO KNOW BEFORE CHANGING THIS:
 *
 * 1. There is no `Certificate` model. A certificate is a `Document` discriminated
 *    by `DocumentType.certificate`. Narrowing on `type` is an INFERENCE — the
 *    spines say "applicable standards" and name no column — but it is the only
 *    reading that does not put datasheets and drawings in a certificates block.
 * 2. `is_public` is the visibility column here (`Document` has no `status`), and it
 *    defaults to TRUE — the opposite of `Product.status`. Filtering is therefore
 *    still required, just for the inverse reason: a document deliberately marked
 *    private must not be enumerated.
 *
 * This read LISTS ONLY. Downloading (ungated, version-stable URLs) is Story 2.3.
 */
export async function listCertificatesByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<CertificateListItem[]> {
  return cached(
    () => queryCertificatesByIndustry(industrySlug, locale, limit),
    ["certificates-by-industry", industrySlug, locale, String(limit ?? "all")],
    [TAGS.documents, TAGS.industry(industrySlug)],
  );
}

/** What the download handler needs — no translations, no locale. */
export interface DocumentFile {
  slug: string;
  fileKey: string;
  mime: string | null;
  sizeBytes: number | null;
}

/**
 * One PUBLIC document by slug, or `null` (Story 2.3). Absent and private are ONE
 * null path, deliberately — the download handler must not let a prober
 * distinguish "exists but private" from "does not exist" (unpublished items are
 * never enumerable).
 *
 * Cache-key honesty (the 2.2 rule): the handler's slug gate bounds SHAPE and
 * LENGTH of what reaches this key, not CARDINALITY — a valid-shaped unknown slug
 * still mints one null entry at the handler TTL. Same class as the deferred
 * existence-check item; this surface joins it.
 */
export async function getDocumentBySlug(slug: string): Promise<DocumentFile | null> {
  return cached(() => queryDocumentBySlug(slug), ["document", slug], [TAGS.documents]);
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryDocumentBySlug(slug: string): Promise<DocumentFile | null> {
  const document = await prisma.document.findUnique({
    where: { slug },
    select: { slug: true, fileKey: true, mime: true, sizeBytes: true, isPublic: true },
  });
  if (!document || !document.isPublic) return null;

  return {
    slug: document.slug,
    fileKey: document.fileKey,
    mime: document.mime,
    sizeBytes: document.sizeBytes,
  };
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryCertificatesByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<CertificateListItem[]> {
  const documents = await prisma.document.findMany({
    where: {
      type: "certificate",
      isPublic: true,
      industries: { some: { industry: { slug: industrySlug } } },
    },
    include: { translations: true },
    orderBy: { slug: "asc" },
    take: limit,
  });

  return documents.map((document) => toCertificateListItem(document, locale));
}

/** A product's document, carrying its type so the page can label the row. */
export interface ProductDocumentItem extends CertificateListItem {
  type: DocumentType;
}

/**
 * Every PUBLIC document attached to `productSlug`, for the detail page's
 * Documents section (Story 2.4; FR14 — "a product with documents exposes working
 * download links").
 *
 * FILTERED AND ORDERED IN THE QUERY, deliberately — the same discipline Story
 * 2.3 settled for the card's datasheet pick. A mapper that sorted afterwards
 * could drift from the query's idea of "newest", and the two would disagree about
 * which version is current.
 *
 * Order: type (so datasheets, certificates and manuals group), then `version`
 * DESC (newest first), then slug as the tiebreak — fully deterministic, which is
 * what makes the result safe to cache.
 *
 * `isPublic: true` is the whole confidentiality boundary. The seed carries
 * `fd-9500-datasheet-internal` — a PRIVATE v2 datasheet on the most-populated
 * product — precisely so this filter has a live negative fixture: it is the
 * highest version on that product, so a broken filter surfaces it first.
 */
export async function listDocumentsByProduct(
  productSlug: string,
  locale: Locale,
): Promise<ProductDocumentItem[]> {
  return cached(
    () => queryDocumentsByProduct(productSlug, locale),
    ["documents-by-product", productSlug, locale],
    [TAGS.documents, TAGS.catalog],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryDocumentsByProduct(
  productSlug: string,
  locale: Locale,
): Promise<ProductDocumentItem[]> {
  const documents = await prisma.document.findMany({
    where: { isPublic: true, product: { slug: productSlug } },
    orderBy: [{ type: "asc" }, { version: "desc" }, { slug: "asc" }],
    include: { translations: true },
  });

  return documents.map((document) => ({
    ...toCertificateListItem(document, locale),
    type: document.type,
  }));
}

// ---- Writes (Story 4.6, admin CRUD) ---------------------------------------
//
// The read repo above is the FROZEN Story 2.3 contract. These writes never touch
// `slug` after create (it is the stable public identity, FR25a) and always keep
// `fileKey` under the `docs/` prefix (the stream route hard-asserts it). Every
// mutation is purged by `TAGS.documents` alone: all three readers include it, so
// busting it invalidates every document-derived cache entry (verified above).

export interface DocumentTitleWrite {
  locale: Locale;
  title: string;
}

export interface DocumentEditData {
  id: string;
  slug: string;
  type: DocumentType;
  isPublic: boolean;
  version: number;
  mime: string | null;
  sizeBytes: number | null;
  productId: string | null;
  manufacturerId: string | null;
  industryIds: string[];
  translations: { locale: Locale; title: string }[];
  /** The stable public download URL — shown on the edit page. */
  downloadHref: string;
}

export interface AdminDocumentRow {
  id: string;
  slug: string;
  type: DocumentType;
  isPublic: boolean;
  version: number;
  title: string;
}

/** All documents for the admin list — ALL rows incl. private, EN-fallback title. */
export async function listDocumentsForAdmin(locale: Locale): Promise<AdminDocumentRow[]> {
  const rows = await prisma.document.findMany({
    include: { translations: true },
    orderBy: [{ type: "asc" }, { slug: "asc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    slug: d.slug,
    type: d.type,
    isPublic: d.isPublic,
    version: d.version,
    title: resolveTranslation(d.translations, locale)?.value.title ?? d.slug,
  }));
}

/** Load one document's editable fields + raw translations + linked industry ids. */
export async function getDocumentForEdit(id: string): Promise<DocumentEditData | null> {
  const d = await prisma.document.findUnique({
    where: { id },
    include: { translations: true, industries: { select: { industryId: true } } },
  });
  if (!d) return null;
  return {
    id: d.id,
    slug: d.slug,
    type: d.type,
    isPublic: d.isPublic,
    version: d.version,
    mime: d.mime,
    sizeBytes: d.sizeBytes,
    productId: d.productId,
    manufacturerId: d.manufacturerId,
    industryIds: d.industries.map((i) => i.industryId),
    translations: d.translations.map((t) => ({ locale: t.locale, title: t.title })),
    downloadHref: `/api/documents/${d.slug}`,
  };
}

/**
 * Create a document with its translations + industry joins. The file is already
 * validated, scanned and stored under `docs/` by the upload route — this only
 * writes the row. `version` starts at 1. Throws on a duplicate slug (P2002).
 */
export async function createDocument(data: {
  slug: string;
  type: DocumentType;
  fileKey: string;
  mime: string;
  sizeBytes: number;
  isPublic: boolean;
  productId?: string | null;
  manufacturerId?: string | null;
  industryIds: string[];
  translations: DocumentTitleWrite[];
}): Promise<{ id: string }> {
  return prisma.document.create({
    data: {
      slug: data.slug,
      type: data.type,
      fileKey: data.fileKey,
      mime: data.mime,
      sizeBytes: data.sizeBytes,
      version: 1,
      isPublic: data.isPublic,
      productId: data.productId ?? null,
      manufacturerId: data.manufacturerId ?? null,
      translations: {
        create: data.translations.map((t) => ({ locale: t.locale, title: t.title })),
      },
      industries: { create: data.industryIds.map((industryId) => ({ industryId })) },
    },
    select: { id: true },
  });
}

/**
 * Replace a document's FILE (FR25a). Bumps `version`, repoints `fileKey` + mime +
 * sizeBytes; `slug` and associations are untouched. Returns the OLD fileKey so the
 * caller can delete the superseded object AFTER this repoint commits (upload new →
 * repoint row → delete old), or null if the document is gone.
 */
export async function replaceDocumentFile(
  id: string,
  file: { fileKey: string; mime: string; sizeBytes: number },
): Promise<{ oldFileKey: string } | null> {
  const existing = await prisma.document.findUnique({ where: { id }, select: { fileKey: true } });
  if (!existing) return null;
  await prisma.document.update({
    where: { id },
    data: {
      fileKey: file.fileKey,
      mime: file.mime,
      sizeBytes: file.sizeBytes,
      version: { increment: 1 },
    },
  });
  return { oldFileKey: existing.fileKey };
}

/**
 * Update a document's metadata + associations (NOT slug, NOT fileKey/version).
 * delete-recreate translations + industry joins in a transaction. Returns false
 * if the document is gone.
 */
export async function updateDocumentMeta(
  id: string,
  data: {
    type: DocumentType;
    isPublic: boolean;
    productId?: string | null;
    manufacturerId?: string | null;
    industryIds: string[];
    translations: DocumentTitleWrite[];
  },
): Promise<boolean> {
  const exists = await prisma.document.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.document.update({
      where: { id },
      data: {
        type: data.type,
        isPublic: data.isPublic,
        productId: data.productId ?? null,
        manufacturerId: data.manufacturerId ?? null,
      },
    }),
    prisma.documentTranslation.deleteMany({ where: { documentId: id } }),
    prisma.documentTranslation.createMany({
      data: data.translations.map((t) => ({ documentId: id, locale: t.locale, title: t.title })),
    }),
    prisma.documentIndustry.deleteMany({ where: { documentId: id } }),
    prisma.documentIndustry.createMany({
      data: data.industryIds.map((industryId) => ({ documentId: id, industryId })),
    }),
  ]);
  return true;
}

/**
 * Delete a document — the S3 object FIRST, then the row (translations +
 * `DocumentIndustry` cascade), per the storage delete-ordering contract (a crash
 * leaves an orphan object, never a row pointing at a gone object). No reference
 * guard: products/industries link TO a document, so deleting one only removes it
 * from those read lists. Returns the deleted fileKey, or null if already gone.
 */
export async function deleteDocument(id: string): Promise<{ fileKey: string } | null> {
  const existing = await prisma.document.findUnique({ where: { id }, select: { fileKey: true } });
  if (!existing) return null;
  await deleteObject(existing.fileKey);
  await prisma.document.delete({ where: { id } });
  return { fileKey: existing.fileKey };
}
