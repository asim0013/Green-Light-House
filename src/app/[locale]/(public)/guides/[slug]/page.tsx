import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { getGuideBySlug } from "@/server/repositories/selection-guide";
import { guideSignals } from "@/server/guide-page";
import { Link } from "@/i18n/navigation";
import { Breadcrumb } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";

/**
 * A selection-guide detail page (Story 4.11 — FR41/FR42/FR42a). PUBLISHED guides
 * only — a draft/unknown slug `notFound()`s (and `generateMetadata` emits
 * `noindex` for it). Semantic `<article>` with the guide's prose + curated
 * internal links to recommended products/categories (the SEO-authority payload).
 * robots/sitemap share `guideSignals` (one predicate). `force-dynamic`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};
  const guide = await getGuideBySlug(slug, locale);
  if (!guide) return { robots: robotsFor(guideSignals(locale, null)) }; // draft/unknown → noindex
  return {
    title: guide.title,
    description: guide.metaDescription ?? guide.intro ?? undefined,
    alternates: alternatesFor(locale, `/guides/${slug}`),
    robots: robotsFor(guideSignals(locale, guide)),
  };
}

export default async function GuideDetailPage(props: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [t, guide] = await Promise.all([
    getTranslations({ locale, namespace: "Guides" }),
    getGuideBySlug(slug, locale),
  ]);
  if (!guide) notFound();
  const lang = guide.isFallback ? "en" : undefined;

  return (
    <article className="bg-surface">
      <Breadcrumb
        items={[
          { label: t("crumb"), href: "/guides" },
          { label: guide.title, isFallback: guide.isFallback },
        ]}
      />
      <div className={`${CONTAINER} py-10 md:py-12`}>
        <header className="max-w-[72ch]">
          <h1
            lang={lang}
            className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]"
          >
            {guide.title}
            <FallbackNotice isFallback={guide.isFallback} />
          </h1>
          {guide.intro && (
            <p
              lang={lang}
              className="mt-4 text-[17px] leading-relaxed text-ink-2 whitespace-pre-line"
            >
              {guide.intro}
            </p>
          )}
        </header>

        {guide.sections.length > 0 && (
          <div className="mt-8 flex max-w-[72ch] flex-col gap-8">
            {guide.sections.map((s, i) => (
              <section key={i}>
                <h2
                  lang={s.isFallback ? "en" : undefined}
                  className="font-heading text-[20px] font-semibold text-ink"
                >
                  {s.heading}
                </h2>
                <p
                  lang={s.isFallback ? "en" : undefined}
                  className="mt-2 text-[15px] leading-relaxed text-ink-2 whitespace-pre-line"
                >
                  {s.body}
                </p>
              </section>
            ))}
          </div>
        )}

        {guide.products.length > 0 && (
          <section className="mt-10 border-t border-border-subtle pt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
              {t("recommendedProducts")}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {guide.products.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/products/${p.slug}`}
                    className="text-[15px] text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span lang={p.isFallback ? "en" : undefined}>{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {guide.categories.length > 0 && (
          <section className="mt-8 border-t border-border-subtle pt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
              {t("recommendedCategories")}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {guide.categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/products?category=${encodeURIComponent(c.slug)}`}
                    className="text-[15px] text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span lang={c.isFallback ? "en" : undefined}>{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 text-[13px]">
          <Link
            href="/guides"
            className="text-ink-2 hover:text-accent hover:underline underline-offset-4"
          >
            ← {t("title")}
          </Link>
        </p>
      </div>
    </article>
  );
}
