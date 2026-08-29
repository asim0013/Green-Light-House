import { PrismaClient, Prisma, Locale, PublishStatus, DocumentType } from "@prisma/client";
import { fixtureSize } from "../scripts/doc-fixtures";
import { MEDIA_FIXTURES } from "../scripts/media-fixtures";
import {
  SLA_PROCESS_TEXT,
  SLA_STEPS,
  type SlaProcessText,
  type SlaStepText,
} from "../scripts/sla-fixtures";

const prisma = new PrismaClient();

type Tr = { locale: Locale; name: string; description?: string };

function names(en: string, tr?: string, ru?: string): Tr[] {
  const out: Tr[] = [{ locale: Locale.en, name: en }];
  if (tr) out.push({ locale: Locale.tr, name: tr });
  if (ru) out.push({ locale: Locale.ru, name: ru });
  return out;
}

/**
 * Upsert NAME translations per locale, REPAIRABLY (Story 3.4).
 *
 * ⚠️ THE CLASS THIS CLOSES: a nested `translations: { create }` under an
 * `update: {}` branch runs ONLY on first insert. On a long-lived dev database a
 * later fixture edit — a corrected Turkish category name, a newly added Russian
 * one — silently never propagates, and the seed reads as if it had. Story 2.6
 * found the same shape on services and Story 3.1 fixed it for projects; 3.4
 * fixes it for INDUSTRIES and CATEGORIES specifically, because those are the two
 * entities whose names the RFQ pre-fill banner renders. A translation that can
 * never be repaired is a banner that can never be corrected.
 *
 * The remaining sites (manufacturers, series, products) still carry the old
 * shape and are recorded as deferred rather than swept in here.
 */
async function upsertIndustryNames(industryId: string, translations: Tr[]) {
  for (const { locale, name } of translations) {
    await prisma.industryTranslation.upsert({
      where: { industryId_locale: { industryId, locale } },
      update: { name },
      create: { industryId, locale, name },
    });
  }
  await deleteUnlistedLocales(
    (locales) => prisma.industryTranslation.deleteMany({ where: { industryId, locale: locales } }),
    translations,
  );
}

async function upsertCategoryNames(categoryId: string, translations: Tr[]) {
  for (const { locale, name } of translations) {
    await prisma.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId, locale } },
      update: { name },
      create: { categoryId, locale, name },
    });
  }
  await deleteUnlistedLocales(
    (locales) => prisma.categoryTranslation.deleteMany({ where: { categoryId, locale: locales } }),
    translations,
  );
}

/**
 * Retract translations the fixture no longer lists.
 *
 * ⚠️ THE HALF THE UPSERT CANNOT DO, and the one that actually drew blood (3.4
 * review). An upsert repairs a CHANGED row but leaves a REMOVED one behind.
 * Story 3.4 seeded its new project fixture with Russian names, which un-thinned
 * `/ru/projects` and broke two SEO proofs — and deleting them from this file was
 * NOT enough: the orphan row had to be removed from the database by hand, with
 * nothing in the repo encoding that repair. A seed that cannot retract is a seed
 * whose output depends on every version of itself that has ever run.
 *
 * ⚠️ IMPLICATION, stated deliberately: for these two entities the seed is now
 * DECLARATIVE — this file is the whole truth, and a locale absent from it will
 * be deleted on the next run. That is what makes it idempotent; it also means
 * Epic 4's admin must not treat `db:seed` as safe to run against rows a human
 * has edited.
 */
async function deleteUnlistedLocales(
  remove: (locales: { notIn: Locale[] }) => Promise<unknown>,
  translations: readonly { locale: Locale }[],
) {
  await remove({ notIn: translations.map((t) => t.locale) });
}

// --- Story 3.5: the response process / SLA ---------------------------------
//
// The COPY lives in `scripts/sla-fixtures.ts`, not here, so the AC5 hygiene gate
// can derive its needles from the same strings without a database — the same
// arrangement `doc-fixtures` and `media-fixtures` already use.

/** Repairable AND retractable, exactly like `upsertIndustryNames` above. */
async function upsertSlaProcessText(processId: string, translations: SlaProcessText[]) {
  for (const { locale, kicker, summary } of translations) {
    await prisma.slaProcessTranslation.upsert({
      where: { processId_locale: { processId, locale } },
      update: { kicker, summary },
      create: { processId, locale, kicker, summary },
    });
  }
  await deleteUnlistedLocales(
    (locale) => prisma.slaProcessTranslation.deleteMany({ where: { processId, locale } }),
    translations,
  );
}

async function upsertSlaStepText(stepId: string, translations: SlaStepText[]) {
  for (const { locale, badge, title, description } of translations) {
    await prisma.slaStepTranslation.upsert({
      where: { stepId_locale: { stepId, locale } },
      update: { badge, title, description },
      create: { stepId, locale, badge, title, description },
    });
  }
  await deleteUnlistedLocales(
    (locale) => prisma.slaStepTranslation.deleteMany({ where: { stepId, locale } }),
    translations,
  );
}

async function main() {
  // --- Industries (a couple carry TR/RU; the rest exercise EN fallback) ---
  const industries = [
    { slug: "oil-gas", tr: names("Oil & Gas", "Petrol ve Gaz", "Нефть и газ") },
    { slug: "energy", tr: names("Energy") },
    { slug: "nuclear", tr: names("Nuclear") },
    { slug: "construction", tr: names("Construction") },
    { slug: "manufacturing", tr: names("Manufacturing") },
    { slug: "fire-safety", tr: names("Fire Safety", "Yangın Güvenliği") },
  ];
  for (const i of industries) {
    const rec = await prisma.industry.upsert({
      where: { slug: i.slug },
      update: {},
      create: { slug: i.slug },
    });
    // REPAIRABLE, per locale — see upsertNameTranslations. The RFQ pre-fill
    // banner renders these names.
    await upsertIndustryNames(rec.id, i.tr);
  }

  // --- Manufacturers ---
  const manufacturers = [
    { slug: "sentra-fire", tr: names("Sentra Fire Systems") },
    { slug: "gastec", tr: names("Gastec") },
    { slug: "exlume", tr: names("Exlume") },
    { slug: "aerosafe", tr: names("Aerosafe") },
  ];
  for (const m of manufacturers) {
    await prisma.manufacturer.upsert({
      where: { slug: m.slug },
      update: {},
      create: { slug: m.slug, translations: { create: m.tr } },
    });
  }

  // --- Categories (one parent → child to exercise the hierarchy) ---
  const fireGas = await prisma.category.upsert({
    where: { slug: "fire-gas-detection" },
    update: {},
    create: { slug: "fire-gas-detection" },
  });
  await upsertCategoryNames(fireGas.id, names("Fire & gas detection", "Yangın ve gaz algılama"));
  const categories = [
    { slug: "flame-detectors", parent: "fire-gas-detection", tr: names("Flame detectors") },
    { slug: "fixed-suppression", tr: names("Fixed fire suppression") },
    { slug: "ex-proof", tr: names("Explosion-proof equipment") },
    { slug: "ppe", tr: names("Personal protective equipment") },
  ];
  for (const c of categories) {
    const rec = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        parent: c.parent ? { connect: { slug: c.parent } } : undefined,
      },
    });
    await upsertCategoryNames(rec.id, c.tr);
  }

  // --- Series ---
  await prisma.series.upsert({
    where: { slug: "flameguard" },
    update: {},
    create: {
      slug: "flameguard",
      manufacturer: { connect: { slug: "sentra-fire" } },
      translations: { create: names("FlameGuard") },
    },
  });

  // --- Products (FD-9500 carries TR; RU falls back to EN) ---
  const products = [
    {
      slug: "fd-9500",
      model: "FD-9500",
      mfr: "sentra-fire",
      cat: "flame-detectors",
      series: "flameguard",
      status: PublishStatus.published,
      attributes: {
        detection: "Triple-IR (IR³)",
        response: "< 5 s",
        enclosure: "IP66 / IP67",
        hazArea: "ATEX Zone 1",
      },
      tr: names("Triple-IR (IR³) Flame Detector", "Üç-IR (IR³) Alev Dedektörü"),
      industries: ["oil-gas", "fire-safety", "energy"],
    },
    {
      slug: "gd-410",
      model: "GD-410",
      mfr: "gastec",
      cat: "fire-gas-detection",
      status: PublishStatus.published,
      attributes: { detection: "Catalytic + IR", output: "4–20 mA" },
      tr: names("GD-410 Fixed Gas Detector"),
      industries: ["oil-gas"],
    },
    {
      slug: "xb-200",
      model: "XB-200",
      mfr: "exlume",
      cat: "ex-proof",
      status: PublishStatus.published,
      attributes: { rating: "Ex d IIC", output: "116 dB beacon+sounder" },
      tr: names("XB-200 Ex-proof Beacon"),
      industries: ["oil-gas"],
    },
    {
      slug: "as-60",
      model: "AS-60",
      mfr: "aerosafe",
      cat: "ppe",
      status: PublishStatus.published,
      attributes: { type: "SCBA", duration: "60 min", cylinder: "9 L / 300 bar" },
      tr: names("AS-60 SCBA Air Set"),
      industries: ["oil-gas", "fire-safety"],
    },
    {
      slug: "fd-9300",
      model: "FD-9300",
      mfr: "sentra-fire",
      cat: "flame-detectors",
      series: "flameguard",
      status: PublishStatus.published,
      attributes: { detection: "Dual-IR", response: "< 5 s" },
      tr: names("Dual-IR Flame Detector FD-9300"),
      industries: ["oil-gas", "fire-safety"],
    },
    {
      slug: "wc-95",
      model: "WC-95",
      mfr: "sentra-fire",
      cat: "ppe",
      status: PublishStatus.draft,
      attributes: { fits: "FD-9500", material: "316 SS" },
      tr: names("Weather Cover WC-95"),
      industries: [],
    },
  ];
  for (const p of products) {
    const rec = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        model: p.model,
        slug: p.slug,
        status: p.status,
        attributes: p.attributes,
        manufacturer: { connect: { slug: p.mfr } },
        category: { connect: { slug: p.cat } },
        series: p.series ? { connect: { slug: p.series } } : undefined,
        translations: { create: p.tr },
      },
    });
    for (const ind of p.industries) {
      const industry = await prisma.industry.findUniqueOrThrow({ where: { slug: ind } });
      await prisma.productIndustry.upsert({
        where: { productId_industryId: { productId: rec.id, industryId: industry.id } },
        update: {},
        create: { productId: rec.id, industryId: industry.id },
      });
    }
  }

  // --- Documents (ungated; attached to FD-9500) ---
  //
  // Story 2.3 backfilled `mime` + `sizeBytes` (both were NULL, which collided
  // with the "doc links state format + size" a11y rule) and added the FIRST
  // `DocumentIndustry` rows — before that, `document_industries` had zero rows
  // and the industry-page certificates block had no populated fixture anywhere
  // (the 2.1 defer this closes). The `update` branch keeps re-seeding idempotent
  // AND repairs pre-2.3 rows.
  //
  // `sizeBytes` is DERIVED from the same generator that writes the objects
  // (`fixtureSize`), never transcribed. Hand-copied numbers silently became lies
  // the moment a fixture label changed — see scripts/doc-fixtures.ts.
  const fd9500 = await prisma.product.findUniqueOrThrow({ where: { slug: "fd-9500" } });
  const documents = [
    {
      slug: "fd-9500-datasheet",
      type: DocumentType.datasheet,
      fileKey: "docs/fd-9500-datasheet-v1.pdf",
      mime: "application/pdf",
      version: 1,
      isPublic: true,
      industries: [] as string[],
      tr: [{ locale: Locale.en, title: "FD-9500 Datasheet" }],
    },
    {
      slug: "fd-9500-en54",
      type: DocumentType.certificate,
      fileKey: "docs/fd-9500-en54-v1.pdf",
      mime: "application/pdf",
      version: 1,
      isPublic: true,
      // The EN 54 certificate applies to the sectors that audit against it —
      // this populates the industry-page certificates block (FR12).
      industries: ["oil-gas", "fire-safety"],
      tr: [{ locale: Locale.en, title: "EN 54-10 Certificate" }],
    },
    {
      // THE PRIVATE FIXTURE (2.3 review). Two properties had no end-to-end proof
      // because no private row existed anywhere outside the integration suite:
      //   1. a private slug must 404 EXACTLY like an unknown one, so private
      //      documents cannot be enumerated over HTTP;
      //   2. the datasheet pick must ignore private rows — this one carries the
      //      HIGHEST version, so if the `isPublic` filter ever broke it would win
      //      the pick and surface on the product card.
      // Its fileKey points at the REAL datasheet object on purpose: the 404 must
      // come from `isPublic`, not from a conveniently missing file.
      slug: "fd-9500-datasheet-internal",
      type: DocumentType.datasheet,
      fileKey: "docs/fd-9500-datasheet-v1.pdf",
      mime: "application/pdf",
      version: 2,
      isPublic: false,
      industries: [] as string[],
      tr: [{ locale: Locale.en, title: "FD-9500 Datasheet (internal draft)" }],
    },
  ];
  for (const d of documents) {
    const sizeBytes = fixtureSize(d.fileKey);
    const doc = await prisma.document.upsert({
      where: { slug: d.slug },
      update: { mime: d.mime, sizeBytes, isPublic: d.isPublic, version: d.version },
      create: {
        slug: d.slug,
        type: d.type,
        fileKey: d.fileKey,
        mime: d.mime,
        sizeBytes,
        version: d.version,
        isPublic: d.isPublic,
        product: { connect: { id: fd9500.id } },
        translations: { create: d.tr },
      },
    });
    for (const industrySlug of d.industries) {
      const industry = await prisma.industry.findUniqueOrThrow({ where: { slug: industrySlug } });
      await prisma.documentIndustry.upsert({
        where: { documentId_industryId: { documentId: doc.id, industryId: industry.id } },
        update: {},
        create: { documentId: doc.id, industryId: industry.id },
      });
    }
  }

  // --- Projects ---
  //
  // ⚠️ TRANSLATIONS ARE UPSERTED PER LOCALE (Story 3.1). They used to be written
  // ONLY inside `create`, with `update: {}` on the project — so on this long-lived
  // dev database a re-seed could never repair a row or add a locale, while
  // printing success. New copy simply never arrived. `deferred-work.md:120`
  // prescribes exactly this helper shape.
  const oilGas = await prisma.industry.findUniqueOrThrow({ where: { slug: "oil-gas" } });
  const fireSafety = await prisma.industry.findUniqueOrThrow({ where: { slug: "fire-safety" } });

  type ProjectSeed = {
    slug: string;
    /** NULLABLE. The column is nullable in the schema and Story 3.4 needs a
     *  published project with NO industry as a live fixture — see the fourth
     *  project below. */
    industryId: string | null;
    deliveredAt?: Date;
    media?: unknown;
    translations: { locale: Locale; title: string; description?: string; outcome?: string }[];
  };

  async function upsertProject({
    slug,
    industryId,
    deliveredAt,
    media,
    translations,
  }: ProjectSeed) {
    const project = await prisma.project.upsert({
      where: { slug },
      // Repairable: every field a later edit might change is in BOTH branches.
      update: {
        status: PublishStatus.published,
        industryId,
        deliveredAt: deliveredAt ?? null,
        // `ProjectMediaEntry[]` is not assignable to Prisma's `Json` input type,
        // so the cast lives HERE, at the write boundary, and nowhere else. The
        // shape is validated on the way OUT by `parseProjectMedia`.
        //
        // OMITTED media means "NO photos" and WRITES [] (3.1 review): leaving the
        // column untouched on update meant a fixture edit that removed photos
        // silently never propagated to this long-lived dev database — the exact
        // unrepairable-seed class the per-locale upserts above exist to close.
        media: (media ?? []) as Prisma.InputJsonValue,
      },
      create: {
        slug,
        status: PublishStatus.published,
        industryId,
        deliveredAt: deliveredAt ?? null,
        media: (media ?? []) as Prisma.InputJsonValue,
      },
    });

    for (const { locale, title, description, outcome } of translations) {
      await prisma.projectTranslation.upsert({
        where: { projectId_locale: { projectId: project.id, locale } },
        update: { title, description: description ?? null, outcome: outcome ?? null },
        create: {
          projectId: project.id,
          locale,
          title,
          description: description ?? null,
          outcome: outcome ?? null,
        },
      });
    }

    return project;
  }

  const lng = await upsertProject({
    slug: "lng-terminal-fire-gas-upgrade",
    industryId: oilGas.id,
    deliveredAt: new Date("2024-06-01T00:00:00.000Z"),
    translations: [
      {
        locale: Locale.en,
        title: "LNG terminal fire & gas upgrade",
        outcome: "142 field devices, ATEX Zone 1, delivered in six weeks.",
      },
      {
        locale: Locale.tr,
        title: "LNG terminali yangın ve gaz yükseltmesi",
        // ⚠️ `outcome` is deliberately LEFT OUT here. It is the live fixture for
        // the per-field fallback (Story 3.1, AC2b): a `tr` row that exists but
        // leaves a body field NULL, which used to make the outcome vanish on /tr
        // with no marker at all. Do not "complete" this translation — the gap is
        // the test subject.
      },
    ],
  });

  await upsertProject({
    slug: "refinery-gas-detection-retrofit",
    industryId: oilGas.id,
    translations: [{ locale: Locale.en, title: "Refinery gas-detection retrofit" }],
  });

  /**
   * The SECOND INDUSTRY and the ONLY project with photos (Story 3.1, AC17).
   *
   * ⚠️ `fire-safety` IS A CONSTRAINED CHOICE, NOT A FREE ONE. `e2e/seo.spec.ts`
   * asserts that `construction`, `manufacturing` and `nuclear` are THIN and
   * therefore absent from the sitemap — seeding a project into any of them
   * un-thins it and destroys that FR42a negative proof. `fire-safety` already has
   * 3 published products and a certificate, so its indexability does not change.
   *
   * ⚠️ DATED BEFORE THE LNG PROJECT, DELIBERATELY. `HomeHero` renders `projects[0]`
   * under `deliveredAt DESC NULLS LAST`, so a later date here would silently steal
   * the homepage hero and redden three shipped assertions that name the LNG
   * project. 2023 keeps the hero where it is.
   *
   * ⚠️ oil-gas IS LEFT AT 2 PROJECTS. `PROJECT_LIMIT` is 3, so a third would sit
   * exactly on the cap and a fourth would clip silently with no view-all
   * affordance — the `SERVICE_LIMIT` failure Story 2.6 shipped.
   */
  await upsertProject({
    slug: "hospital-fire-suppression",
    industryId: fireSafety.id,
    deliveredAt: new Date("2023-09-01T00:00:00.000Z"),
    media: MEDIA_FIXTURES.map((fixture, index) => ({
      id: fixture.id,
      storageKey: fixture.key,
      mime: fixture.mime,
      alt: { en: fixture.altEn, tr: fixture.altTr },
      sort: index,
    })),
    translations: [
      {
        locale: Locale.en,
        title: "Hospital clean-agent suppression",
        description:
          "A clean-agent suppression and detection package for a 400-bed hospital, specified around occupied-space discharge limits and commissioned ward by ward without closing a floor.",
        outcome: "Zero wards closed during commissioning; handover on the contracted date.",
      },
      {
        locale: Locale.tr,
        title: "Hastane temiz gazlı söndürme",
        description:
          "400 yataklı bir hastane için temiz gazlı söndürme ve algılama paketi; dolu hacim boşaltma sınırlarına göre belirlendi ve hiçbir kat kapatılmadan servis servis devreye alındı.",
        outcome: "Devreye alma sırasında hiçbir servis kapatılmadı; teslim sözleşme tarihinde.",
      },
    ],
  });

  /**
   * ⚠️ THE NULL-INDUSTRY PROJECT — a FIXTURE, not a content decision (Story 3.4,
   * AC2). `Project.industry_id` is nullable and always has been, but no seeded
   * project exercised it, so the doorway's "the banner names only the context
   * that actually resolved" branch had nothing to prove itself against. The 3.1
   * review disclosed the gap and left it open; 3.4 needs it, so 3.4 seeds it.
   *
   * IT HAS NO LINKED PRODUCTS EITHER, which makes it the DEGENERATE case in
   * full: a doorway that resolves neither an industry nor a single chip must
   * render the RFQ exactly as a cold visit does — no banner, no empty shell, no
   * placeholder text, 200.
   *
   * ⚠️ ITS SECTOR IS DELIBERATELY NONE, not "construction"/"manufacturing"/
   * "nuclear". Those three are the seed's THIN industries and `e2e/seo.spec.ts`
   * proves they are absent from the sitemap; giving one a project would un-thin
   * it and destroy that negative proof (seed.ts's own recorded constraint).
   */
  await upsertProject({
    slug: "standalone-workshop-fitout",
    industryId: null,
    deliveredAt: new Date("2024-02-01T00:00:00.000Z"),
    translations: [
      {
        locale: Locale.en,
        title: "Standalone workshop fit-out",
        description:
          "A general workshop fit-out delivered outside any single sector programme — the reference that exists to prove a project need not belong to an industry.",
        outcome: "Delivered complete; no sector programme attached.",
      },
      {
        locale: Locale.tr,
        title: "Bağımsız atölye donanımı",
        description: "Tek bir sektör programına bağlı olmadan teslim edilen genel atölye donanımı.",
        outcome: "Eksiksiz teslim edildi; bağlı bir sektör programı yok.",
      },
    ],
  });

  for (const slug of ["fd-9500", "gd-410"]) {
    const prod = await prisma.product.findUniqueOrThrow({ where: { slug } });
    await prisma.projectProduct.upsert({
      where: { projectId_productId: { projectId: lng.id, productId: prod.id } },
      update: {},
      create: { projectId: lng.id, productId: prod.id },
    });
  }

  // --- Services (linked to oil & gas) ---
  //
  // FIVE ROWS, ONE PER FR23 COMPETENCY (Story 2.6, decision Q1). FR23 enumerates
  // "project kitting/configuration, technical selection, tender support,
  // import/export, logistics" and its AC makes each an editable content item —
  // but the original seed merged the first and last into one `kitting-logistics`
  // row, so a Services page built from it could satisfy "presents … logistics"
  // only by reading. The merged slug is retired below.
  //
  // DESCRIPTIONS ARE SEEDED (decision Q2). Every service description was NULL,
  // and a competency page of bare headings is exactly the thin content our own
  // indexability predicate is meant to catch. Same reasoning as Story 2.3's
  // mime/sizeBytes backfill: a fixture that makes the feature unprovable is a
  // fixture bug. EN only — TR/RU fall back visibly (FR34a), which is honest
  // about what has actually been translated.
  const services: { slug: string; tr: Tr[] }[] = [
    {
      slug: "project-kitting",
      tr: [
        {
          locale: Locale.en,
          name: "Project kitting & configuration",
          description:
            "Equipment grouped and configured per work package, so what arrives on site matches the drawing rather than the order line.",
        },
      ],
    },
    {
      slug: "technical-selection",
      tr: [
        {
          locale: Locale.en,
          name: "Technical selection",
          description:
            "Specification-led product selection against the standards a project is audited on — hazardous-area classification, ingress protection, detection type.",
        },
      ],
    },
    {
      slug: "tender-support",
      tr: [
        {
          locale: Locale.en,
          name: "Tender & procurement support",
          description:
            "Compliance matrices, datasheets and certificates assembled to the tender's format, with equivalents proposed where a named brand is unavailable.",
        },
      ],
    },
    {
      slug: "import-export",
      tr: [
        {
          locale: Locale.en,
          name: "Import / export & customs",
          description:
            "Cross-border supply on the Türkiye–Russia corridor: customs documentation, classification and clearance handled as part of the delivery.",
        },
      ],
    },
    {
      slug: "logistics",
      tr: [
        {
          locale: Locale.en,
          name: "Logistics & delivery",
          description:
            "Consolidated shipment to site or to a staging warehouse, sequenced against the installation programme.",
        },
      ],
    },
  ];

  // The retired merged row. Idempotent: a no-op once it is gone, and it must run
  // BEFORE the upserts so a re-seed cannot leave six services behind.
  await prisma.service.deleteMany({ where: { slug: "kitting-logistics" } });

  for (const s of services) {
    const rec = await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: { slug: s.slug, translations: { create: s.tr } },
    });
    // Translations are upserted SEPARATELY rather than left to the `create`
    // branch: the original `update: {}` meant a re-seed never repaired an
    // existing row, so the new descriptions would never reach a database that
    // already had these services (the same trap Story 2.3's update branch fixed).
    for (const t of s.tr) {
      await prisma.serviceTranslation.upsert({
        where: { serviceId_locale: { serviceId: rec.id, locale: t.locale } },
        update: { name: t.name, description: t.description ?? null },
        create: {
          serviceId: rec.id,
          locale: t.locale,
          name: t.name,
          description: t.description ?? null,
        },
      });
    }
    await prisma.serviceIndustry.upsert({
      where: { serviceId_industryId: { serviceId: rec.id, industryId: oilGas.id } },
      update: {},
      create: { serviceId: rec.id, industryId: oilGas.id },
    });
  }

  // --- The response process / SLA (Story 3.5 — FR30/FR34a/FR38) ---
  //
  // ⚠️ THIS IS NOW THE ONLY SOURCE OF SLA COPY ON THE SITE. Until this story the
  // same sentence was byte-copied into FOUR `messages/` namespaces × three
  // locales, plus a fifth key for the kicker — fifteen strings, all deleted. Every
  // one of the eight render sites reads these rows instead.
  //
  // The SUMMARY is not a convenience: six of those eight surfaces draw a
  // one-line sentence rather than the stepper, and that sentence is NOT
  // composable from the step data (EN steps say "Spec + proposal" where the
  // sentence says "specced proposal"; TR inverts the order entirely). It is
  // seeded verbatim from the `sla` keys this story removes, so no copy changes.
  //
  // REPAIRABLE AND RETRACTABLE, like industries and categories: a corrected
  // Turkish description propagates on the next seed, and a locale dropped from
  // this fixture is DELETED rather than left orphaned.
  const slaProcess = await prisma.slaProcess.upsert({
    // The key the repository read looks up — `SLA_PROCESS_KEY` in
    // `src/server/repositories/sla.ts`. If these two ever diverge the read
    // returns null and every SLA surface silently empties, which is why
    // `repository.integration.test.ts` asserts the seeded row is findable.
    where: { key: "default" },
    update: {},
    create: { key: "default" },
  });

  await upsertSlaProcessText(slaProcess.id, SLA_PROCESS_TEXT);

  for (const step of SLA_STEPS) {
    const rec = await prisma.slaStep.upsert({
      where: { processId_sort: { processId: slaProcess.id, sort: step.sort } },
      update: {},
      create: { processId: slaProcess.id, sort: step.sort },
    });
    await upsertSlaStepText(rec.id, step.text);
  }

  // A fixture edit that REMOVES a step must not leave the old one behind — the
  // same retraction argument as `deleteUnlistedLocales`, one level up.
  await prisma.slaStep.deleteMany({
    where: { processId: slaProcess.id, sort: { notIn: SLA_STEPS.map((s) => s.sort) } },
  });

  const counts = {
    industries: await prisma.industry.count(),
    manufacturers: await prisma.manufacturer.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    documents: await prisma.document.count(),
    projects: await prisma.project.count(),
    services: await prisma.service.count(),
  };
  console.log("[seed] done:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
