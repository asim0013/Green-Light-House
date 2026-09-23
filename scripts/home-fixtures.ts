/**
 * Homepage content seed fixtures (Story 4.4b). The values are migrated VERBATIM
 * from `messages/*.json` (`Home` namespace) + the old `CERTS` const in
 * `HomeCredibility.tsx`, so the seeded model reproduces today's homepage exactly.
 * Kept in a fixtures module (not inline in the seed) so a hygiene gate can derive
 * needles without a DB — the `scripts/sla-fixtures.ts` pattern.
 *
 * `messages` remains the runtime FALLBACK (the components read
 * `content.field ?? t("field")`), so this seed makes the model the source of
 * truth without a flag-day.
 */

export const HOME_CONTENT_KEY = "homepage";

/** Locale-invariant certification marks (proper nouns — identical in every locale). */
export const CERT_MARKS = ["ISO 9001", "CE", "EN 54", "A.TR"] as const;

export interface HomeContentText {
  locale: "en" | "tr" | "ru";
  kicker: string;
  title: string;
  lead: string;
  noPrices: string;
  credibilityTitle: string;
  capability: string;
  ctaTitle: string;
  industriesTitle: string;
  industriesSub: string;
  categoriesTitle: string;
  manufacturersTitle: string;
}

export const HOME_CONTENT_TEXT: HomeContentText[] = [
  {
    locale: "en",
    kicker: "Project supply",
    title: "Industrial and fire-safety equipment, specified and delivered.",
    lead: "We select, certify and supply equipment for high-stakes industrial projects across the Türkiye–Russia corridor — with the certificates, customs handling and delivery dates the project actually needs.",
    noPrices: "No price shown — a project-specced quote, fast.",
    credibilityTitle: "Specification discipline, proven under audit",
    capability:
      "Our quality process is built to nuclear-grade QA discipline: documented traceability, certified materials and inspection records on every line item. The same discipline applies to a single detector and to a full project kit.",
    ctaTitle: "Send us your specification.",
    industriesTitle: "Built for your sector",
    industriesSub:
      "Equipment, certification and supply scoped to the standards your industry is audited against.",
    categoriesTitle: "What we supply",
    manufacturersTitle: "Manufacturers we supply",
  },
  {
    locale: "tr",
    kicker: "Proje tedariki",
    title: "Endüstriyel ve yangın güvenliği ekipmanları: şartnameye göre seçilir, teslim edilir.",
    lead: "Türkiye–Rusya hattındaki kritik endüstriyel projeler için ekipman seçiyor, sertifikalandırıyor ve tedarik ediyoruz — projenin gerçekten ihtiyaç duyduğu sertifikalar, gümrük işlemleri ve teslim tarihleriyle.",
    noPrices: "Fiyat listesi yok — projeye özel teklif, hızlı.",
    credibilityTitle: "Denetimde kanıtlanmış şartname disiplini",
    capability:
      "Kalite sürecimiz nükleer sınıf kalite güvence disiplinine göre kurgulanmıştır: belgelenmiş izlenebilirlik, sertifikalı malzemeler ve her kalem için muayene kayıtları. Aynı disiplin tek bir dedektör için de tam proje seti için de geçerlidir.",
    ctaTitle: "Şartnamenizi bize gönderin.",
    industriesTitle: "Sektörünüze göre",
    industriesSub:
      "Sektörünüzün denetlendiği standartlara göre belirlenmiş ekipman, sertifikasyon ve tedarik.",
    categoriesTitle: "Neler tedarik ediyoruz",
    manufacturersTitle: "Tedarik ettiğimiz üreticiler",
  },
  {
    locale: "ru",
    kicker: "Проектные поставки",
    title: "Промышленное и противопожарное оборудование: подобрано по спецификации и поставлено.",
    lead: "Мы подбираем, сертифицируем и поставляем оборудование для ответственных промышленных проектов на маршруте Турция — Россия: с нужными сертификатами, таможенным оформлением и реальными сроками поставки.",
    noPrices: "Цены не указываем — быстрое предложение по спецификации проекта.",
    credibilityTitle: "Дисциплина спецификации, подтверждённая аудитом",
    capability:
      "Наш процесс качества построен на дисциплине контроля качества атомного уровня: документированная прослеживаемость, сертифицированные материалы и протоколы контроля по каждой позиции. Тот же подход — и к одному извещателю, и к комплекту на весь проект.",
    ctaTitle: "Пришлите нам свою спецификацию.",
    industriesTitle: "Под вашу отрасль",
    industriesSub:
      "Оборудование, сертификация и поставка в соответствии со стандартами, по которым проверяют вашу отрасль.",
    categoriesTitle: "Что мы поставляем",
    manufacturersTitle: "Производители, которых мы поставляем",
  },
];
