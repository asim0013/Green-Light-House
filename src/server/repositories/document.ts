import type { Locale } from "@prisma/client";
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
}

/**
 * The minimum structural shape `toCertificateListItem` consumes — narrower than
 * Prisma's row type so the mapper is unit-testable with plain objects.
 */
export interface DocumentRow {
  id: string;
  slug: string;
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
