import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";
import { rfqProductHref } from "@/lib/rfq-href";
import { SlaSummary } from "@/components/sla/SlaSummary";
import type { ProductDetail } from "@/server/repositories/product";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The quote / facts anchor card (Story 2.4 — UX-DR7).
 *
 * DESIGN.md § Components: "fixed-width side card, 1px border, header hairline;
 * label/value rows; footer block (hairline top) with primary + secondary CTA +
 * mono trust line." DESIGN.md § Do's: "push side elements right with
 * `fill_container` main + fixed-width side column" — the page owns that layout;
 * this component owns the card.
 *
 * NO PRICE, AND NOTHING THAT LOOKS LIKE ONE (FR2). The facts rows are identity —
 * model, manufacturer, category — and the copy reframes the absence of prices as
 * the offer rather than an apology, per EXPERIENCE.md § Voice ("No price shown —
 * project-specced quote within 24 h", never "Prices available on request").
 *
 * THE MANUFACTURER IS TEXT, NOT A LINK. FR20 (a page per manufacturer) is PHASED
 * and no such route exists; linking it would violate DP-12 ("never link a page
 * that does not exist"). The category IS a link — `/products?category=…` was built
 * in Story 2.2 and is real.
 *
 * The CTAs are co-equal by design (UX-DR14 / FR31): a navy primary to the RFQ and
 * the phone number beside it, not buried. `/rfq` is LIVE since Story 3.2 — the
 * Epic 2 "sanctioned phased-page exception" this card shipped under has expired;
 * the conversion path it kept visible now lands on the real form — and since
 * Story 3.4 it carries `?product=`, so the RFQ opens with this product AND its
 * category already loaded as individually removable chips.
 */
export function ProductAnchorCard({
  product,
  sla,
}: {
  product: ProductDetail;
  /** The response process (Story 3.5); `null` only when unseeded. */
  sla: SlaContent | null;
}) {
  const t = useTranslations("Product");
  const tNav = useTranslations("Nav");

  return (
    <aside className="w-full shrink-0 border border-border-subtle bg-surface lg:w-[340px]">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="font-heading text-[17px] font-semibold text-ink">{t("anchorTitle")}</h2>
        <p className="mt-1.5 text-[13px] text-ink-2">{t("anchorNoPrices")}</p>
      </div>

      <dl className="flex flex-col px-5 py-2">
        <Fact label={t("modelLabel")}>
          <span className="font-data">{product.model}</span>
        </Fact>
        <Fact label={t("manufacturerLabel")}>
          {/* Text, not a link — FR20 is phased. */}
          <span lang={product.manufacturer.isFallback ? "en" : undefined}>
            {product.manufacturer.name}
          </span>
          <FallbackNotice isFallback={product.manufacturer.isFallback} />
        </Fact>
        <Fact label={t("categoryLabel")}>
          <Link
            href={`/products?category=${encodeURIComponent(product.category.slug)}`}
            // `max-sm:min-h-11`: the 44px touch floor the same diff applied to the
            // documents rows and the phone link — this link measured 16px tall
            // without it, a third of the floor, mis-tapping into inert rows
            // (2.4 review).
            className="inline-flex items-center text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11"
          >
            <span lang={product.category.isFallback ? "en" : undefined}>
              {product.category.name}
            </span>
          </Link>
          <FallbackNotice isFallback={product.category.isFallback} />
        </Fact>
      </dl>

      <div className="border-t border-border-subtle px-5 py-4">
        {/* The product doorway (Story 3.4). `product` already carries its slug
            and its category, so the RFQ can pre-load BOTH as removable chips
            without a second read. */}
        <Link
          href={rfqProductHref(product.slug)}
          className={`${buttonClasses("primary")} w-full justify-center`}
        >
          {t("quoteCta")}
        </Link>
        <a
          href={`tel:${SITE.phone}`}
          aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 font-data text-[15px] text-ink hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Phone size={16} aria-hidden />
          {SITE.phoneDisplay}
        </a>
        {/* The mono trust line — the same SLA promise the homepage and every
            industry page make, now literally the same ROW rather than a fourth
            byte-copy of it (Story 3.5). EXPERIENCE.md § Voice: "consistent
            numbers across nav CTA, RFQ, and dark bands"; consistency used to be
            a convention nobody could enforce, and is now structural.

            ⚠️ The only non-uppercase SLA treatment on the site — kept, because
            this aside is denser than the hero bands. */}
        {sla && (
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-2">
            <SlaSummary sla={sla} tone="light" />
          </p>
        )}
      </div>
    </aside>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0">
      <dt className="text-[13px] text-ink-2">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}
