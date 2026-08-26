import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render-level contract of the RFQ form island (Story 3.2, AC5/AC6).
 *
 * ⚠️ HONEST SCOPE (AC12b): `renderToStaticMarkup` proves the INITIAL MARKUP —
 * labels, aria wiring, autocomplete tokens, the honeypot's anatomy, the live
 * region's presence from first render. It CANNOT exercise interactivity: blur
 * validation, focus management, the submit fetch, the confirmation swap and
 * chip add/remove behavior are proven by the resolver unit tests
 * (`@/lib/zod-resolver.test.ts`) and the e2e suite (`e2e/rfq.spec.ts`), not
 * here. An assertion in this file about behavior would be a test that cannot
 * fail — say what is proven, prove what is said.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key;
    t.rich = (key: string) => key;
    return t;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { RfqForm } = await import("./RfqForm");
const { EquipmentChips } = await import("./EquipmentChips");

const INDUSTRIES = [
  { slug: "fire-safety", name: "Fire Safety", isFallback: false },
  { slug: "oil-gas", name: "Oil & Gas", isFallback: true },
];

function render() {
  return renderToStaticMarkup(<RfqForm industries={INDUSTRIES} uiLocale="en" />);
}

describe("RfqForm — initial markup", () => {
  it("every visible control has a visible <label htmlFor> in the mono voice", () => {
    const html = render();
    for (const id of [
      "rfq-industry",
      "rfq-timeline",
      "rfq-equipment",
      "rfq-quantities",
      "rfq-project-details",
      "rfq-name",
      "rfq-company",
      "rfq-email",
      "rfq-phone",
      "rfq-country",
      "rfq-locale",
      "rfq-consent",
    ]) {
      expect(html, `label for ${id}`).toContain(`for="${id}"`);
      expect(html, `control ${id}`).toContain(`id="${id}"`);
    }
    // Natural-case strings, uppercased via CSS — never baked-in (Turkish İ).
    expect(html).toContain("uppercase");
  });

  it("carries the WCAG 1.3.5 autocomplete tokens — exact values per field", () => {
    // React 19's serializer emits the camelCase prop name; HTML attribute names
    // are case-insensitive, so browsers read it as `autocomplete`.
    const html = render().toLowerCase();
    expect(html).toContain('autocomplete="name"');
    expect(html).toContain('autocomplete="organization"');
    expect(html).toContain('autocomplete="email"');
    expect(html).toContain('autocomplete="tel"');
    expect(html).toContain('autocomplete="country-name"');
  });

  it("mounts the polite live region EMPTY from first render", () => {
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-atomic="true"');
    // Polite, not assertive — focus-to-first-invalid announces itself.
    expect(html).not.toContain('aria-live="assertive"');
    expect(html).not.toContain('role="alert"');
  });

  it("honeypot anatomy: aria-hidden wrapper, tabindex=-1, autocomplete=off, label inside, off-screen not display:none", () => {
    const html = render();
    const hidden = /<div aria-hidden="true"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(hidden).toContain('name="website"');
    expect(hidden).toContain('tabindex="-1"');
    expect(hidden.toLowerCase()).toContain('autocomplete="off"');
    expect(hidden).toContain('for="rfq-website"');
    expect(hidden).not.toContain("display:none");
    // Off-screen via clip, never the HTML `hidden` attribute (autofillers skip
    // display:none/hidden fields, which would blind the trap).
    expect(hidden).toContain("[clip:rect(0,0,0,0)]");
    expect(hidden).not.toMatch(/<(input|div|label)[^>]* hidden[ >]/);
  });

  it("the ONLY autocomplete=off on the page is the honeypot's", () => {
    const html = render().toLowerCase();
    expect(html.match(/autocomplete="off"/g)?.length).toBe(1);
  });

  it("industry options carry the slug as value and lang='en' ONLY on fallbacks", () => {
    const html = render();
    expect(html).toContain('<option value="fire-safety">Fire Safety</option>');
    expect(html).toMatch(
      /<option [^>]*lang="en"[^>]*value="oil-gas"|<option [^>]*value="oil-gas"[^>]*lang="en"/,
    );
    // The genuine-locale option must NOT be marked.
    expect(html).not.toMatch(/<option [^>]*value="fire-safety"[^>]*lang=/);
  });

  it("the language select offers ENDONYMS, preselected to the UI locale in the SERVER paint", () => {
    const html = render();
    expect(html).toContain("Türkçe");
    expect(html).toContain("Русский");
    // RHF applies defaultValues only at hydration — the select's defaultValue
    // is what keeps the /tr and /ru first paint honest.
    expect(html).toMatch(
      /<option [^>]*selected[^>]*value="en"|<option [^>]*value="en"[^>]*selected/,
    );
  });

  it("timeline offers a real empty first option plus the frozen key set", () => {
    const html = render();
    expect(html).toContain('<option value="">timelinePlaceholder</option>');
    for (const key of ["asap", "1-3m", "3-6m", "6m-plus", "exploring"]) {
      expect(html).toContain(`value="${key}"`);
    }
  });

  it("consent: link is OUTSIDE the <label> and points at /privacy", () => {
    const html = render();
    const label = /<label for="rfq-consent"[\s\S]*?<\/label>/.exec(html)?.[0] ?? "";
    expect(label).toContain("consent");
    expect(label).not.toContain("<a ");
    expect(html).toContain('href="/privacy"');
  });

  it("no native validation — the shared schema is the only validator", () => {
    expect(render().toLowerCase()).toContain("novalidate");
  });

  it("submit is the canvas verb with the note beside it", () => {
    const html = render();
    expect(html).toContain("submit</button>");
    expect(html).toContain("submitNote");
  });
});

describe("EquipmentChips — chips markup", () => {
  it("each chip's remove control is a real 44px BUTTON naming its chip", () => {
    const html = renderToStaticMarkup(
      <EquipmentChips
        inputId="rfq-equipment"
        items={[{ kind: "freeText", text: "20 t overhead crane" }]}
        onAdd={() => {}}
        onRemove={() => {}}
        announce={() => {}}
      />,
    );
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="equipmentRemove:20 t overhead crane"');
    expect(html).toContain("min-h-11 min-w-11");
    // The icon is decorative; the aria-label carries the name.
    expect(html).toContain('aria-hidden="true"');
  });
});
