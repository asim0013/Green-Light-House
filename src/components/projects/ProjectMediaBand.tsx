import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import type { Locale } from "@prisma/client";
import { projectMediaHref } from "@/lib/project-media";
import type { ProjectListItem } from "@/server/repositories/project";

/**
 * The project image band (Story 3.1, AC11/AC12) — canvas frame `#A3cPs`.
 *
 * ⚠️ THE NO-PHOTO STATE IS A DESIGN, NOT AN OMISSION. The recovered canvas draws
 * it deliberately: a full-bleed `surface-2` band with a bottom hairline holding a
 * centred line icon, a mono tracked `FIG. —` caption and a bordered
 * `<industry> · Delivered <year>` chip. That is FR21's "renders with or without
 * photos (no broken image regions)" answered as a drawn state, and the same `FIG.`
 * convention appears on the Product Detail frame, so it is a canvas-wide pattern
 * rather than a one-off. It is also the ONLY branch the current seed can reach.
 *
 * CONTRAST IS LOAD-BEARING HERE. Caption and chip text are `ink-2`, never `muted`
 * (2.89:1 on `surface-2` — fails AA at 11px) and never `brand` green, which
 * DESIGN.md § Don't reserves for the logo mark and the success dot. The icon may
 * stay `muted`: it is decorative and `aria-hidden`, so the text-contrast floor
 * does not apply to it.
 *
 * ONE PHOTO, DELIBERATELY. The canvas draws a single band and `Project.media` has
 * no gallery affordance designed anywhere. `parseProjectMedia` already sorts
 * totally and stably, so "first" is deterministic. A multi-image gallery is
 * unspecified work and belongs with the case-study depth in Story 3.1b.
 *
 * NO INTRINSIC DIMENSIONS EXIST. The frozen `ProjectMediaEntry` carries no width,
 * height or byte size, so `next/image` cannot size the box from the file. The band
 * is a fixed-height full-bleed strip, which is exactly the case `fill` plus a
 * sized container solves — zero layout shift, and no reason to widen the frozen
 * contract (Story 3.1, AC18b).
 */
export function ProjectMediaBand({
  project,
  locale,
}: {
  project: ProjectListItem;
  locale: Locale;
}) {
  const t = useTranslations("Projects");
  const format = useFormatter();

  const photo = project.media[0] ?? null;
  const year = project.deliveredAt
    ? format.dateTime(project.deliveredAt, { year: "numeric" })
    : null;

  /**
   * The chip. Composed from whole messages rather than concatenating a label and a
   * value — separator and word order differ per language.
   */
  const chip = project.industry
    ? year
      ? t("chipDelivered", { industry: project.industry.name, year })
      : project.industry.name
    : year
      ? t("chipYear", { year })
      : null;

  if (photo) {
    /**
     * ALT RESOLVES IN-COMPONENT, and is NOT a translation row (AC12).
     * `ProjectMediaAlt` lives inside JSONB, so `resolveTranslation` does not apply
     * and `project.isFallback` — which is about the TITLE — must not be reused for
     * it. `lang` only, never a visible `FallbackNotice`: alt is announced instead
     * of the image and is invisible to sighted readers, so there is nothing for a
     * visible notice to attach to.
     */
    // A present-but-EMPTY per-locale alt is ABSENT, not content (3.1 review): the
    // frozen parser type-checks non-EN values without an emptiness check, and
    // `"" ?? en` returns "" — which then hid the photo on that locale only,
    // contradicting the contract that EN alt is the fallback source.
    const localised = photo.alt[locale]?.trim() || undefined;
    const alt = localised ?? photo.alt.en;
    const altIsFallback = !localised && locale !== "en";

    /**
     * ⚠️ `alt: { en: "" }` PASSES THE FROZEN PARSER — it type-checks `en` as a
     * string, unlike `storageKey` which is emptiness-checked. An empty alt renders
     * `<img alt="">`, which announces a project photograph as decorative. Treated
     * as a data defect here rather than by loosening the frozen guard: fall through
     * to the drawn no-photo state, which is honest and already designed.
     */
    if (alt.trim()) {
      return (
        <div className="relative h-[280px] w-full border-b border-border-subtle bg-surface-2 md:h-[360px]">
          <Image
            src={projectMediaHref(project.slug, photo.id)}
            alt={alt}
            lang={altIsFallback ? "en" : undefined}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      );
    }
  }

  return (
    <div className="flex h-[280px] w-full flex-col items-center justify-center gap-4 border-b border-border-subtle bg-surface-2 md:h-[360px]">
      <ImageIcon size={72} strokeWidth={1} className="text-muted" aria-hidden />
      {/* Authored captions have no column and the canvas's names a schematic
          subject, not the project — so this is a generic locale-aware caption
          rather than one fabricated from the title (Story 3.1, AC18b). */}
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
        {t("figCaption")}
      </p>
      {chip && (
        /* The industry name is interpolated INSIDE the localized template, so the
           whole chip carries the marking when the name fell back — the IndustryCta
           heading precedent for fragments that cannot be wrapped separately. */
        <p
          lang={project.industry?.isFallback ? "en" : undefined}
          className="border border-muted px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-2"
        >
          {chip}
        </p>
      )}
    </div>
  );
}
