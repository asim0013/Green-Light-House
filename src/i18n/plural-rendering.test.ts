import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";

/**
 * ICU plural RENDERING — Story 3.6 review (added for Story 3.1b's follow-up).
 *
 * ⚠️ THE GAP THIS CLOSES. `messages.test.ts` proves the plural BRANCH SETS match
 * across locales, and the component tests mock `useTranslations` so they only
 * prove a count is PASSED — neither ever renders an ICU plural. So a message
 * written as `{count} units total` (no plural at all) rendered "1 units total"
 * and every gate stayed green. That shipped in 3.1b's BOM footer and this is the
 * test that would have caught it.
 *
 * It uses `createTranslator` — the app's own next-intl formatter — over the real
 * catalogues, so it exercises exactly what a page renders.
 *
 * P5: revert `Projects.bomUnitsTotal` to `"{count} units total"` and the EN
 * count=1 case reddens ("1 units total" ≠ "1 unit total").
 */
function t(locale: string) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  return createTranslator({ locale, messages, namespace: "Projects" });
}

describe("Projects plural messages render grammatically (not '1 units total')", () => {
  it("EN singular/plural differ at the boundary for all three counts", () => {
    const en = t("en");
    expect(en("leadTimeWeeks", { count: 1 })).toBe("1 week");
    expect(en("leadTimeWeeks", { count: 2 })).toBe("2 weeks");
    expect(en("bomLineItems", { count: 1 })).toBe("1 line item");
    expect(en("bomLineItems", { count: 2 })).toBe("2 line items");
    expect(en("bomUnitsTotal", { count: 1 })).toBe("1 unit total");
    expect(en("bomUnitsTotal", { count: 2 })).toBe("2 units total");
  });

  it("RU selects the one/few/many forms — 1 / 2 / 5 are distinct where the noun inflects", () => {
    const ru = t("ru");
    // позиция (one) / позиции (few, 2-4) / позиций (many, 5+)
    expect(ru("bomLineItems", { count: 1 })).toBe("1 позиция");
    expect(ru("bomLineItems", { count: 2 })).toBe("2 позиции");
    expect(ru("bomLineItems", { count: 5 })).toBe("5 позиций");
    // неделя / недели / недель
    expect(ru("leadTimeWeeks", { count: 1 })).toBe("1 неделя");
    expect(ru("leadTimeWeeks", { count: 2 })).toBe("2 недели");
    expect(ru("leadTimeWeeks", { count: 5 })).toBe("5 недель");
    // шт. is invariant, but the plural wrapper must still render without error
    expect(ru("bomUnitsTotal", { count: 1 })).toBe("всего 1 шт.");
    expect(ru("bomUnitsTotal", { count: 5 })).toBe("всего 5 шт.");
  });

  it("TR renders (no numeral agreement — the single form is deliberate)", () => {
    const tr = t("tr");
    expect(tr("bomLineItems", { count: 1 })).toBe("1 kalem");
    expect(tr("bomLineItems", { count: 5 })).toBe("5 kalem");
    expect(tr("bomUnitsTotal", { count: 1 })).toBe("toplam 1 adet");
    expect(tr("leadTimeWeeks", { count: 3 })).toBe("3 hafta");
  });
});
