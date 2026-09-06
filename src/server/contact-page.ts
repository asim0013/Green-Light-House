import type { Locale } from "@prisma/client";
import type { ContentSignals } from "@/lib/seo";
import {
  CONTACT,
  configuredChannels,
  isFullyConfigured,
  type ContactChannel,
  type ContactDetails,
} from "@/config/contact";

/**
 * `/contact`'s indexability predicate (Story 3.8, AC5 — one predicate per surface).
 *
 * ⚠️ IT FOLLOWS `rfqSignals`, NOT `servicesSignals`, AND THE EPICS SAYS THE
 * OPPOSITE. `servicesSignals` counts DB rows and their `isFallback` flags;
 * `/contact` has no DB rows of its own — its content is config plus a
 * locale-complete `messages/` namespace.
 *
 * ⚠️ AND `fallbackFields`/`totalFields` ARE OMITTED DELIBERATELY, which is the
 * half that would have caused real damage. Contact VALUES are locale-INVARIANT
 * by design: an address and a tax number are not translated, only their labels
 * are. Feeding them through the fallback ratio would make `fallbackFields ===
 * totalFields` for every non-EN locale and **permanently `noindex`
 * `/tr/contact` and `/ru/contact`** — a page correctly serving Turkish labels
 * over Turkish-registered details, marked unfit to index, forever. The labels
 * cannot be missing either: `messages.test.ts` fails the suite on a partial
 * namespace, so "fallback-only" is not a state this page can reach.
 *
 * ⚠️ THE SLA IS NOT COUNTED. Same reasoning as `services-page.ts:41-52`,
 * `rfq-page.ts:17-28`, `industry-page.ts` and `sitemap.ts`: the SLA is site-wide
 * chrome rendered on nine surfaces, and a fully-translated chrome element must
 * never be the evidence that a THIN page deserves indexing.
 *
 * ⚠️ IT TAKES THE WHOLE CONFIG, NOT A CHANNEL LIST, AND THAT IS A DELIBERATE
 * DEPARTURE FROM THE STORY SPEC. The spec said `contactSignals(locale, channels)`
 * so the noindex branch would be testable — but `isPlaceholder` needs the config
 * too, and reading the module constant for it would have left the INDEXABLE
 * branch unreachable from a test, which is the same defect one level down. One
 * argument drives both.
 *
 * Consumed by BOTH the page's `generateMetadata` and `sitemap.ts`, so the robots
 * tag and the sitemap's inclusion rule cannot disagree (FR42a). Those two sides
 * have silently drifted THREE times in this project.
 */
export function contactSignals(locale: Locale, contact: ContactDetails = CONTACT): ContentSignals {
  const channels: readonly ContactChannel[] = configuredChannels(contact);

  return {
    locale,
    /** The channels the page will actually render. Zero ⇒ nothing to show. */
    itemCount: channels.length,
    /**
     * ⚠️ NOT `channels.length === 0`, and the distinction is load-bearing.
     *
     * A zero count ALREADY reads as thin through `itemCount`, so defining
     * `isPlaceholder` that way makes it dead code — and worse, it would let a
     * page with a single configured channel advertise itself while the address
     * and the registered name are still missing. `thinContentReason` checks
     * `isPlaceholder` FIRST, which is exactly the `/privacy` precedent: a
     * placeholder can never be indexable, so there is no second predicate to
     * drift from.
     */
    isPlaceholder: !isFullyConfigured(contact),
  };
}
