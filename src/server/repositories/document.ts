import type { Locale, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
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
