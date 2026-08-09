import Image from "next/image";
import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/ui";
import { CONTAINER } from "@/components/layout/container";
import type { ManufacturerListItem } from "@/server/repositories/manufacturer";

/**
 * OEM partner marks (Story 1.7, FR8).
 *
 * DISPLAY-ONLY — this is the one place FR8 states it outright: homepage logos are
 * "display-only or link to the catalog filtered by that manufacturer — never to a
 * dead phased page (DP-12)", and its AC requires every logo to either have no link
 * or resolve to a live filtered view. Manufacturer pages are phased (FR20) and the
 * filtered catalog is Epic 2, so v1 renders no anchor at all.
 *
 * Every seeded `logoUrl` is null, so the wordmark is the path that actually runs;
 * the image branch is the seam for Story 4.5 (media library), which also owns the
 * `images.remotePatterns` config that a remote logo URL would require.
 */
export function HomeManufacturers({ manufacturers }: { manufacturers: ManufacturerListItem[] }) {
  const t = useTranslations("Home");

  return (
    <section className="border-b border-border-subtle bg-surface">
      <div className={`${CONTAINER} py-12 md:py-16`}>
        <SectionHeader kicker={t("manufacturersKicker")} title={t("manufacturersTitle")} />

        {manufacturers.length === 0 ? (
          <p className="mt-6 text-ink-2">{t("manufacturersEmpty")}</p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {manufacturers.map((manufacturer) => (
              <li
                key={manufacturer.id}
                className="flex h-24 items-center justify-center border border-border-subtle bg-surface px-5"
              >
                {manufacturer.logoUrl ? (
                  <Image
                    src={manufacturer.logoUrl}
                    alt={manufacturer.name}
                    width={140}
                    height={40}
                    className="h-10 w-auto object-contain"
                  />
                ) : (
                  <span className="text-center font-heading text-base font-semibold tracking-tight text-ink">
                    {manufacturer.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
