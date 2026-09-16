import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm, FormProvider } from "react-hook-form";
import {
  TranslationTabs,
  NAME_ONLY_FIELDS,
  NAME_DESCRIPTION_FIELDS,
  errorText,
  CATALOG_ERROR_TEXT,
} from "./CatalogFormKit";

/**
 * The reusable catalog form kit (Story 4.3). `errorText` is the inline-English
 * bridge for the shared stable error keys; `TranslationTabs` is the EN|TR|RU
 * authoring surface (initial render = EN active, all locales registered).
 */
describe("errorText", () => {
  it("maps every stable key to inline English", () => {
    for (const key of Object.keys(CATALOG_ERROR_TEXT)) {
      expect(errorText(key)).toBe(CATALOG_ERROR_TEXT[key as keyof typeof CATALOG_ERROR_TEXT]);
    }
  });

  it("falls back for an unknown key and returns undefined for none", () => {
    expect(errorText("mystery")).toBe("This value is not valid.");
    expect(errorText(undefined)).toBeUndefined();
  });
});

function Host({ withDescription }: { withDescription: boolean }) {
  const form = useForm({
    defaultValues: { nameEn: "", nameTr: "", nameRu: "", descriptionEn: "" },
  });
  return (
    <FormProvider {...form}>
      <TranslationTabs fields={withDescription ? NAME_DESCRIPTION_FIELDS : NAME_ONLY_FIELDS} />
    </FormProvider>
  );
}

describe("TranslationTabs", () => {
  it("renders EN | TR | RU tabs with EN required and all name fields registered", () => {
    const h = renderToStaticMarkup(<Host withDescription={false} />);
    expect(h).toContain('role="tablist"');
    expect(h).toContain(">EN<");
    expect(h).toContain(">TR<");
    expect(h).toContain(">RU<");
    // All three locale name inputs exist (registered), so validation sees every language.
    expect(h).toContain('id="nameEn"');
    expect(h).toContain('id="nameTr"');
    expect(h).toContain('id="nameRu"');
  });

  it("renders a field for every locale × config field (description only when configured)", () => {
    // P5: drop the `type: "textarea"` field from NAME_DESCRIPTION_FIELDS and the
    // description assertion reddens; the name-only config must never emit one.
    expect(renderToStaticMarkup(<Host withDescription={false} />)).not.toContain(
      'id="descriptionEn"',
    );
    expect(renderToStaticMarkup(<Host withDescription={true} />)).toContain('id="descriptionEn"');
  });
});
