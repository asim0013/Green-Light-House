/**
 * The canonical path to one project (Story 3.1).
 *
 * ⚠️ A LEAF MODULE, DELIBERATELY, AND THIS IS NOT COSMETIC. This function first
 * lived in `@/server/project-page`, next to the signals it pairs with. But
 * `ProjectCard` and `HomeHero` need it to build an href — and importing it from
 * there dragged the whole data layer (`repositories/project` → `repositories/product`
 * → Prisma) into the module graph of the homepage and all six industry pages,
 * purely to produce a string. Measured consequence: the dev-mode compile of those
 * pages grew until `e2e/home.spec.ts`'s six-page sweep exceeded its 60 s timeout.
 *
 * A component must not import the data layer to learn a URL. `src/lib/catalog-href.ts`
 * is the same pattern for `/products`.
 *
 * A HELPER, NOT A TEMPLATE LITERAL, and `sitemap.ts` must use it too: the sitemap
 * does no XML escaping of its own, so every URL it emits has to be encoded at the
 * point of construction. `isValidSlug` filtering at the data source is the other
 * half — a slug that never reaches here cannot need escaping.
 */
export function projectHref(slug: string): string {
  return `/projects/${encodeURIComponent(slug)}`;
}
