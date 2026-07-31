import { PrismaClient, Locale, PublishStatus, DocumentType } from "@prisma/client";

const prisma = new PrismaClient();

type Tr = { locale: Locale; name: string; description?: string };

function names(en: string, tr?: string, ru?: string): Tr[] {
  const out: Tr[] = [{ locale: Locale.en, name: en }];
  if (tr) out.push({ locale: Locale.tr, name: tr });
  if (ru) out.push({ locale: Locale.ru, name: ru });
  return out;
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
    await prisma.industry.upsert({
      where: { slug: i.slug },
      update: {},
      create: { slug: i.slug, translations: { create: i.tr } },
    });
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
  await prisma.category.upsert({
    where: { slug: "fire-gas-detection" },
    update: {},
    create: {
      slug: "fire-gas-detection",
      translations: { create: names("Fire & gas detection", "Yangın ve gaz algılama") },
    },
  });
  const categories = [
    { slug: "flame-detectors", parent: "fire-gas-detection", tr: names("Flame detectors") },
    { slug: "fixed-suppression", tr: names("Fixed fire suppression") },
    { slug: "ex-proof", tr: names("Explosion-proof equipment") },
    { slug: "ppe", tr: names("Personal protective equipment") },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        parent: c.parent ? { connect: { slug: c.parent } } : undefined,
        translations: { create: c.tr },
      },
    });
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
  const fd9500 = await prisma.product.findUniqueOrThrow({ where: { slug: "fd-9500" } });
  const documents = [
    {
      slug: "fd-9500-datasheet",
      type: DocumentType.datasheet,
      fileKey: "docs/fd-9500-datasheet-v1.pdf",
      tr: [{ locale: Locale.en, title: "FD-9500 Datasheet" }],
    },
    {
      slug: "fd-9500-en54",
      type: DocumentType.certificate,
      fileKey: "docs/fd-9500-en54-v1.pdf",
      tr: [{ locale: Locale.en, title: "EN 54-10 Certificate" }],
    },
  ];
  for (const d of documents) {
    await prisma.document.upsert({
      where: { slug: d.slug },
      update: {},
      create: {
        slug: d.slug,
        type: d.type,
        fileKey: d.fileKey,
        isPublic: true,
        product: { connect: { id: fd9500.id } },
        translations: { create: d.tr },
      },
    });
  }

  // --- Projects (LNG terminal carries TR; links products) ---
  const oilGas = await prisma.industry.findUniqueOrThrow({ where: { slug: "oil-gas" } });
  const lng = await prisma.project.upsert({
    where: { slug: "lng-terminal-fire-gas-upgrade" },
    update: {},
    create: {
      slug: "lng-terminal-fire-gas-upgrade",
      status: PublishStatus.published,
      industryId: oilGas.id,
      deliveredAt: new Date("2024-06-01T00:00:00.000Z"),
      translations: {
        create: [
          {
            locale: Locale.en,
            title: "LNG terminal fire & gas upgrade",
            outcome: "142 field devices, ATEX Zone 1, delivered in six weeks.",
          },
          { locale: Locale.tr, title: "LNG terminali yangın ve gaz yükseltmesi" },
        ],
      },
    },
  });
  await prisma.project.upsert({
    where: { slug: "refinery-gas-detection-retrofit" },
    update: {},
    create: {
      slug: "refinery-gas-detection-retrofit",
      status: PublishStatus.published,
      industryId: oilGas.id,
      translations: { create: [{ locale: Locale.en, title: "Refinery gas-detection retrofit" }] },
    },
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
  const services = [
    { slug: "technical-selection", tr: names("Technical selection") },
    { slug: "tender-support", tr: names("Tender & procurement support") },
    { slug: "import-export", tr: names("Import / export & customs") },
    { slug: "kitting-logistics", tr: names("Project kitting & logistics") },
  ];
  for (const s of services) {
    const rec = await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: { slug: s.slug, translations: { create: s.tr } },
    });
    await prisma.serviceIndustry.upsert({
      where: { serviceId_industryId: { serviceId: rec.id, industryId: oilGas.id } },
      update: {},
      create: { serviceId: rec.id, industryId: oilGas.id },
    });
  }

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
