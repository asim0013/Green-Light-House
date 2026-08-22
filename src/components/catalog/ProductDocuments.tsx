import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { formatDocMeta } from "@/lib/doc-meta";
import type { ProductDocumentItem } from "@/server/repositories/document";

/**
 * The per-product Documents section (Story 2.4 — FR14; EXPERIENCE.md:40,
 * "per-product docs live on product detail now").
 *
 * UNGATED, per Story 2.3: every row is a plain `<a>` straight to
 * `/api/documents/<slug>` — the response IS the file. It must NOT be the next-intl
 * `Link`: an `/api` URL carries no locale segment, and routing it through the
 * locale-aware Link would rewrite a URL the proxy matcher deliberately excludes.
 *
 * FORMAT + SIZE ARE INSIDE THE LINK (EXPERIENCE.md's a11y floor: "datasheet links
 * state format + size in text"), so the accessible name carries them too. They are
 * omitted gracefully when the columns are NULL — `formatDocMeta` never invents a
 * size, which matters because both columns were NULL on every seeded row for two
 * stories.
 *
 * THE ACCESSIBLE NAME CARRIES THE DOCUMENT TITLE, not just its type. The 2.3
 * review found every product card computing the identical name
 * ("Datasheet PDF · 602 B"), so a screen-reader links list read N indistinguishable
 * entries; here the title is the first thing in the link.
 *
 * PRIVATE DOCUMENTS NEVER REACH THIS COMPONENT — `listDocumentsByProduct` filters
 * `isPublic` in the query. The seed carries `fd-9500-datasheet-internal` (private,
 * and the HIGHEST version on the most-populated product) precisely so a broken
 * filter would surface it here first.
 */
export function ProductDocuments({ documents }: { documents: readonly ProductDocumentItem[] }) {
  const t = useTranslations("Product");
  // Omit the section entirely rather than render a heading over nothing.
  if (documents.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
        {t("documentsTitle")}
      </h2>
      <p className="mt-2 text-[13px] text-ink-2">{t("documentsLead")}</p>
      <ul className="mt-4 flex flex-col border-t border-border-subtle">
        {documents.map((document) => {
          const meta = formatDocMeta(document.mime, document.sizeBytes);
          return (
            <li key={document.id} className="border-b border-border-subtle">
              <a
                href={`/api/documents/${document.slug}`}
                className="flex items-center gap-3 py-3 text-[14px] font-semibold text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11"
              >
                <Download size={15} aria-hidden className="shrink-0" />
                <span lang={document.isFallback ? "en" : undefined}>{document.title}</span>
                <FallbackNotice isFallback={document.isFallback} />
                {meta && (
                  <span className="ml-auto font-data text-xs font-normal text-ink-2">{meta}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
