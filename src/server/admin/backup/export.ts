import { Prisma } from "@prisma/client";
import { prisma, leadsDb } from "@/lib/db";

/**
 * Full-dataset export / backup (Story 4.9 — FR36c).
 *
 * Assembles ONE re-importable JSON document covering every content/catalog/lead
 * model. This is the EXPORT half of the 4.9/4.10 pair — it produces the file; it
 * does NOT import or restore (that is Story 4.10 / a restore script).
 *
 * ⛔ ADMINUSER IS NEVER READ. A downloadable backup must not carry `passwordHash`
 * (argon2id, offline-crackable) or `resetTokenHash` (a live single-use recovery
 * credential). FR36c's scope is "catalog + leads", not credentials; the admin is
 * bootstrapped per-environment (`scripts/bootstrap-admin.ts`), never migrated.
 * `CONTACT.approvals` are code-flipped and are not a DB column, so they cannot
 * appear either. `export.integration.test.ts` asserts their absence in the output.
 *
 * ⚠️ TRANSLATIONS ARE EXPORTED UNRESOLVED — every locale row as stored, never
 * EN-resolved. Using `resolveTranslation`/the `list*` readers would collapse
 * TR/RU data. This reads translation rows raw via `include`.
 *
 * ⚠️ JSON COLUMNS ARE RAW. `Lead.equipment`/`prefillContext`, `Product.attributes`
 * /`media`, `Project.media`, `HomeContent.certMarks` are exported as stored, NOT
 * flattened — unlike the leads CSV path (`listLeadsForExport` → `labelOf`), which
 * is lossy and unsuitable for a re-importable backup.
 *
 * Storage KEYS for attachments/media ARE included (a restore re-links objects);
 * the S3/MinIO objects themselves are out of scope (backed up at the storage
 * layer, NFR11) — see `meta.note`. Rows are ordered by a stable natural key so
 * two exports of an unchanged database are byte-identical.
 *
 * Scale is trivial (~130 seeded rows), so the whole document is assembled in
 * memory and the route serializes it in one pass — no streaming.
 */

const localeOrder = { orderBy: { locale: "asc" } } as const;

export interface ExportMeta {
  /** Bumped when the document shape changes, so a restore can validate it. */
  formatVersion: 1;
  /** ISO timestamp the export was produced. */
  exportedAt: string;
  generator: "glh";
  /** What the file does and does NOT contain. */
  note: string;
}

export interface DatasetExport {
  meta: ExportMeta;
  data: {
    industries: Prisma.IndustryGetPayload<{ include: { translations: true } }>[];
    manufacturers: Prisma.ManufacturerGetPayload<{ include: { translations: true } }>[];
    categories: Prisma.CategoryGetPayload<{ include: { translations: true } }>[];
    series: Prisma.SeriesGetPayload<{ include: { translations: true } }>[];
    products: Prisma.ProductGetPayload<{ include: { translations: true } }>[];
    productIndustries: Prisma.ProductIndustryGetPayload<object>[];
    documents: Prisma.DocumentGetPayload<{ include: { translations: true } }>[];
    documentIndustries: Prisma.DocumentIndustryGetPayload<object>[];
    projects: Prisma.ProjectGetPayload<{
      include: { translations: true; bomLines: { include: { translations: true } } };
    }>[];
    services: Prisma.ServiceGetPayload<{ include: { translations: true } }>[];
    serviceIndustries: Prisma.ServiceIndustryGetPayload<object>[];
    accessoryCompatibilities: Prisma.AccessoryCompatibilityGetPayload<object>[];
    crossReferences: Prisma.CrossReferenceGetPayload<object>[];
    slaProcesses: Prisma.SlaProcessGetPayload<{
      include: { translations: true; steps: { include: { translations: true } } };
    }>[];
    homeContent: Prisma.HomeContentGetPayload<{ include: { translations: true } }>[];
    teamMembers: Prisma.TeamMemberGetPayload<{ include: { translations: true } }>[];
    mediaAssets: Prisma.MediaAssetGetPayload<{ include: { translations: true } }>[];
    siteSettings: Prisma.SiteSettingsGetPayload<object> | null;
    leads: Prisma.LeadGetPayload<object>[];
  };
}

/**
 * Read every content/catalog/lead model (NEVER `AdminUser`) and assemble the
 * backup document. Deterministic ordering throughout.
 */
export async function buildDatasetExport(): Promise<DatasetExport> {
  const [
    industries,
    manufacturers,
    categories,
    series,
    products,
    productIndustries,
    documents,
    documentIndustries,
    projects,
    services,
    serviceIndustries,
    accessoryCompatibilities,
    crossReferences,
    slaProcesses,
    homeContent,
    teamMembers,
    mediaAssets,
    siteSettings,
    leads,
  ] = await Promise.all([
    prisma.industry.findMany({ orderBy: { slug: "asc" }, include: { translations: localeOrder } }),
    prisma.manufacturer.findMany({
      orderBy: { slug: "asc" },
      include: { translations: localeOrder },
    }),
    prisma.category.findMany({ orderBy: { slug: "asc" }, include: { translations: localeOrder } }),
    prisma.series.findMany({ orderBy: { slug: "asc" }, include: { translations: localeOrder } }),
    prisma.product.findMany({ orderBy: { slug: "asc" }, include: { translations: localeOrder } }),
    prisma.productIndustry.findMany({ orderBy: [{ productId: "asc" }, { industryId: "asc" }] }),
    prisma.document.findMany({ orderBy: { slug: "asc" }, include: { translations: localeOrder } }),
    prisma.documentIndustry.findMany({ orderBy: [{ documentId: "asc" }, { industryId: "asc" }] }),
    prisma.project.findMany({
      orderBy: { slug: "asc" },
      include: {
        translations: localeOrder,
        bomLines: { orderBy: { sortOrder: "asc" }, include: { translations: localeOrder } },
      },
    }),
    prisma.service.findMany({ orderBy: { slug: "asc" }, include: { translations: localeOrder } }),
    prisma.serviceIndustry.findMany({ orderBy: [{ serviceId: "asc" }, { industryId: "asc" }] }),
    prisma.accessoryCompatibility.findMany({
      orderBy: [{ productId: "asc" }, { accessoryProductId: "asc" }],
    }),
    prisma.crossReference.findMany({ orderBy: { id: "asc" } }),
    prisma.slaProcess.findMany({
      orderBy: { key: "asc" },
      include: {
        translations: localeOrder,
        steps: { orderBy: { sort: "asc" }, include: { translations: localeOrder } },
      },
    }),
    prisma.homeContent.findMany({
      orderBy: { key: "asc" },
      include: { translations: localeOrder },
    }),
    prisma.teamMember.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      include: { translations: localeOrder },
    }),
    prisma.mediaAsset.findMany({ orderBy: { id: "asc" }, include: { translations: localeOrder } }),
    prisma.siteSettings.findUnique({ where: { id: "singleton" } }),
    // Story 5.3: leads come from the leads store, which may be a different
    // (regional) database — reading `prisma.lead` here would back up an EMPTY table
    // once the stores are split.
    leadsDb.lead.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);

  return {
    meta: {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      generator: "glh",
      note: "Full content/catalog/lead dataset. Excludes admin credentials. Attachment/media storage keys are included; the stored objects themselves are backed up at the storage layer, not in this file.",
    },
    data: {
      industries,
      manufacturers,
      categories,
      series,
      products,
      productIndustries,
      documents,
      documentIndustries,
      projects,
      services,
      serviceIndustries,
      accessoryCompatibilities,
      crossReferences,
      slaProcesses,
      homeContent,
      teamMembers,
      mediaAssets,
      siteSettings,
      leads,
    },
  };
}
