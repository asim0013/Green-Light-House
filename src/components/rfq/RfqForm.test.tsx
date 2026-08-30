import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RfqPrefill } from "@/server/rfq-prefill";
import en from "../../../messages/en.json";
import tr from "../../../messages/tr.json";
import ru from "../../../messages/ru.json";

/**
 * Render-level contract of the RFQ form island (Story 3.2, AC5/AC6).
 *
 * ⚠️ HONEST SCOPE (AC12b, corrected in the 3.2 review — the first version of
 * this note claimed e2e coverage that did not exist, the project's signature
 * failure mode): `renderToStaticMarkup` proves the INITIAL MARKUP — labels,
 * aria wiring, autocomplete tokens, the honeypot's anatomy, the live region's
 * presence from first render. Interactivity is proven elsewhere, PRECISELY:
 * the resolver unit tests prove validation verdicts; `e2e/rfq.spec.ts` proves
 * submit, the confirmation swap, focus-to-first-invalid, blur-triggered
 * validation, chip add (Enter), chip REMOVE with focus-to-add-input and the
 * removal announcement, and the draft-commit-at-submit path. STILL UNPROVEN
 * anywhere: the multi-chip remove focus chain (focus moving to the NEXT
 * chip's remove button — only the last-chip → add-input leg is e2e-covered).
 * An assertion in this file about behavior would be a test that cannot fail —
 * say what is proven, prove what is said.
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

const { RfqForm, failureKeyOf, precheckAttachment } = await import("./RfqForm");
const { EquipmentChips } = await import("./EquipmentChips");
const { AttachmentField } = await import("./AttachmentField");

const INDUSTRIES = [
  { slug: "fire-safety", name: "Fire Safety", isFallback: false },
  { slug: "oil-gas", name: "Oil & Gas", isFallback: true },
];

function render() {
  // `sla={null}` (Story 3.5): the prop is REQUIRED so that a mount which forgets
  // to thread the content model fails to compile. Null is the honest value for
  // every assertion in this file — the SLA renders only on the confirmation,
  // which this island swaps in after a POST and no test here reaches. The
  // confirmation is covered by `RfqConfirmation.test.tsx`.
  return renderToStaticMarkup(<RfqForm industries={INDUSTRIES} uiLocale="en" sla={null} />);
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
    // Present AND empty (3.2 review: the emptiness half was unasserted).
    expect(html).toMatch(/<div role="status" aria-atomic="true"[^>]*><\/div>/);
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
    // display:none/hidden fields, which would blind the trap). React
    // serializes a boolean attribute as `hidden=""` — the first version of
    // this regex demanded ` hidden[ >]` and could never fail (3.2 review;
    // negative-proven by adding `hidden` to the input and watching it go red).
    expect(hidden).toContain("[clip:rect(0,0,0,0)]");
    expect(hidden).not.toMatch(/<(input|div|label)[^>]* hidden(=""|=| |>)/);
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
    // Under the echo-translator mock, asserting rendered text only pins the
    // KEY (tautological — 3.2 review). The markup half proves the key is
    // rendered in the button; the REAL en.json half pins the canvas strings.
    const html = render();
    expect(html).toContain("submit</button>");
    expect(html).toContain("submitNote");
    expect(en.Rfq.submit).toBe("Send project inquiry");
    expect(en.Rfq.consent).toBe(
      "I agree that GREENLIGHTHOUSE may process the details above to respond to my inquiry, per the Privacy Policy. We never gate documents or sell your data.",
    );
  });
});

describe("failureKeyOf — the 429 branch (Story 3.7a)", () => {
  it("429 selects rateLimited; everything else falls to submitFailed", () => {
    // Before this branch existed a 429 rendered submitFailed's "please try
    // again" — an invitation to immediately re-trip the limiter.
    expect(failureKeyOf(429)).toBe("rateLimited");
    expect(failureKeyOf(500)).toBe("submitFailed");
    expect(failureKeyOf(503)).toBe("submitFailed");
    expect(failureKeyOf(418)).toBe("submitFailed");
  });
});

describe("EquipmentChips — chips markup", () => {
  it("each chip's remove control is a real 44px BUTTON naming its chip", () => {
    const html = renderToStaticMarkup(
      <EquipmentChips
        inputId="rfq-equipment"
        inputRef={createRef<HTMLInputElement>()}
        items={[{ kind: "freeText", text: "20 t overhead crane" }]}
        draft=""
        onDraftChange={() => {}}
        onCommit={() => {}}
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

describe("the attachment field (Story 3.7b, AC7)", () => {
  const html = () => render();

  it("is a REAL file input, not a div pretending to be one", () => {
    // Drag-and-drop is an enhancement. If the only drop target were a styled
    // div, the field would be unreachable by keyboard, invisible to a screen
    // reader and impossible on a phone.
    expect(html()).toContain('type="file"');
    expect(html()).toContain('id="rfq-attachment"');
  });

  it("carries a real label and the 44px target on the file button", () => {
    expect(html()).toContain('for="rfq-attachment"');
    expect(html()).toContain("file:min-h-11");
  });

  it("accepts exactly the three formats, derived from the server table", () => {
    expect(html()).toContain('accept=".pdf,.xlsx,.dwg"');
  });

  it("describes itself with the CONSTRAINTS line, so the rule is announced too", () => {
    // A sighted user reads the limits under the control; a screen-reader user
    // gets them only if the control points at them.
    expect(html()).toContain('aria-describedby="rfq-attachment-constraints"');
    expect(html()).toContain('id="rfq-attachment-constraints"');
  });

  it("uses border-ink-2 for its own borders — asserted on the STANDALONE render", () => {
    // ⚠️ Rewritten in the 3.7b review: the first version was titled "NEVER
    // border-muted" while asserting only that ink-2 was PRESENT — and the
    // whole-form markup legitimately contains border-muted on every OTHER
    // control (the 3.2 white-card recipe), so absence could never be asserted
    // here and the title overclaimed. The absence half now lives in the
    // standalone AttachmentField suite below, where "no border-muted" is
    // literally true of the component's own markup.
    expect(html()).toContain("border-ink-2");
  });

  it("renders no progress bar while idle", () => {
    // The in-flight state is opt-in: a submission with no file must never show
    // an upload bar, and neither must an untouched form.
    expect(html()).not.toContain("<progress");
  });
});

describe("the constraint copy is DERIVED, not written down (Task 0 #13 / AC8)", () => {
  it("passes the SERVER constants into the message at the call site", () => {
    // Under the echo-translator mock the interpolated values are visible, so
    // this pins what the component actually hands to `t()`. The literals here
    // are deliberate and this is the ONE place they appear: changing the limit
    // or the format table must force a conscious edit to exactly one test.
    // `unitMegabytes` echoes as its KEY here (the mock translator returns keys),
    // which is itself the proof that the unit is a message rather than a
    // hard-coded "MB"; the real value is pinned against en.json below.
    expect(render()).toContain("attachmentConstraints:PDF · XLSX · DWG,15,unitMegabytes");
  });

  it("the MESSAGE is an ICU shell in all three locales — a baked value cannot pass", () => {
    // This is the structural half, and it is the one that matters. AC13 as
    // originally specified pinned the rendered literal "PDF / XLSX, <= 15 MB",
    // which could never fail: that fragment is Latin and identical in all three
    // locales by default, so it stays green the moment a translator
    // copy-pastes. Asserting the PLACEHOLDERS instead makes drift impossible —
    // a catalogue that hard-codes 15, or the format names, goes red here.
    for (const [locale, messages] of [
      ["en", en],
      ["tr", tr],
      ["ru", ru],
    ] as const) {
      const shell = messages.Rfq.attachmentConstraints;
      expect(shell, `${locale} formats`).toContain("{formats}");
      expect(shell, `${locale} size`).toContain("{size}");
      expect(shell, `${locale} unit`).toContain("{unit}");
      expect(shell, `${locale} must not bake the number`).not.toMatch(/\d/);
      expect(shell, `${locale} must not bake the format names`).not.toMatch(/PDF|XLSX|DWG/);
      // The canvas glyphs: U+2264, not "<=" and not a look-alike.
      expect(shell, `${locale} uses U+2264`).toContain(String.fromCharCode(0x2264));
    }
  });

  it("the size and type ERRORS interpolate too — epics:970 wants the limit named", () => {
    for (const [locale, messages] of [
      ["en", en],
      ["tr", tr],
      ["ru", ru],
    ] as const) {
      expect(messages.Rfq.errors.fileTooLarge, `${locale} names the size`).toContain("{size}");
      expect(messages.Rfq.errors.fileTooLarge, `${locale} names the unit`).toContain("{unit}");
      expect(messages.Rfq.errors.fileTooLarge, `${locale} bakes no number`).not.toMatch(/\d/);
      expect(messages.Rfq.errors.fileType, `${locale} names the formats`).toContain("{formats}");
    }
  });

  it("the megabyte unit is LOCALIZED — Russian does not say MB", () => {
    // The one value in the derived line that is genuinely translatable. If all
    // three read "MB" the derivation would still work and the Russian copy
    // would still be wrong.
    expect(en.Rfq.unitMegabytes).toBe("MB");
    expect(ru.Rfq.unitMegabytes).not.toBe(en.Rfq.unitMegabytes);
  });
});

describe("precheckAttachment — the client-side courtesy (AC7)", () => {
  const fileOf = (name: string, size: number) => {
    const file = new File(["x"], name);
    // jsdom computes `size` from the parts; override it so a 16 MB case does
    // not require allocating 16 MB in a unit test.
    Object.defineProperty(file, "size", { value: size });
    return file;
  };

  it("catches the two failures it can see WITHOUT reading the bytes", () => {
    expect(precheckAttachment(fileOf("huge.pdf", 16 * 1024 * 1024))).toBe("fileTooLarge");
    expect(precheckAttachment(fileOf("macro.docx", 1000))).toBe("fileType");
    expect(precheckAttachment(fileOf("spec.pdf", 1000))).toBeUndefined();
  });

  it("does NOT attempt magic bytes — that is deliberately the server's job", () => {
    // A file whose NAME is fine passes here even if its bytes are not. Moving
    // the container check to the client would make it skippable, and would let
    // a reader mistake this for a security boundary.
    expect(precheckAttachment(fileOf("actually-a-zip.pdf", 1000))).toBeUndefined();
  });

  it("shares the server's boundary exactly — at the limit is fine, one over is not", () => {
    expect(precheckAttachment(fileOf("edge.pdf", 15 * 1024 * 1024))).toBeUndefined();
    expect(precheckAttachment(fileOf("edge.pdf", 15 * 1024 * 1024 + 1))).toBe("fileTooLarge");
  });
});

describe("AttachmentField standalone — the in-flight state and the border token (3.7b review)", () => {
  const renderField = (props: { file?: File | null; uploadPercent?: number | null } = {}) =>
    renderToStaticMarkup(
      <AttachmentField
        id="rfq-attachment"
        inputRef={createRef<HTMLInputElement>()}
        file={props.file ?? null}
        onSelect={() => {}}
        uploadPercent={props.uploadPercent}
        announce={() => {}}
      />,
    );

  it("contains NO border-muted anywhere in its own markup — the absence half", () => {
    // The whole-form test above cannot assert this (every other control
    // legitimately uses border-muted on the white card fill); the component's
    // OWN markup is where "never border-muted" is a checkable claim. This is
    // the assertion that failed against the pre-review markup, whose file
    // button carried `file:border-muted`.
    expect(renderField()).not.toContain("border-muted");
    expect(renderField({ file: new File(["x"], "spec.pdf") })).not.toContain("border-muted");
  });

  it("DETERMINATE upload: <progress> carries the value, the region is aria-busy, the percent line names the file", () => {
    // The review found AC7's in-flight state had no positive test at any layer
    // — only the idle "no progress bar" case was asserted, so deleting the
    // whole uploading branch kept every suite green.
    const html = renderField({ file: new File(["x"], "spec.pdf"), uploadPercent: 42 });
    expect(html).toContain("<progress");
    expect(html).toContain('value="42"');
    expect(html).toContain('max="100"');
    expect(html).toContain('aria-busy="true"');
    // The visible line: the uploading message with name + percent (echo mock).
    expect(html).toContain("attachmentUploading:spec.pdf,42");
  });

  it("INDETERMINATE upload (unknown total): the progress element renders WITHOUT a value", () => {
    // `null` percent = the browser reported no total; an unvalued <progress>
    // is how HTML expresses indeterminate. A hard-coded value here would turn
    // a stalled upload into a confident-looking lie.
    const html = renderField({ file: new File(["x"], "spec.pdf"), uploadPercent: null });
    expect(html).toContain("<progress");
    expect(html).not.toContain('value="');
    expect(html).toContain('aria-busy="true"');
  });

  it("idle: no progress, no aria-busy — the in-flight state is strictly opt-in", () => {
    const html = renderField({ file: new File(["x"], "spec.pdf") });
    expect(html).not.toContain("<progress");
    expect(html).not.toContain("aria-busy");
    // Idle-with-file shows the filename and the remove control instead.
    expect(html).toContain("spec.pdf");
    expect(html).toContain("attachmentRemove");
  });
});

describe("the PRE-FILLED render — the SSR paint (Story 3.4, Task 0 #54)", () => {
  /**
   * ⚠️ §H UNIT TEST #9, WRITTEN BY THE 3.4 REVIEW. Story 3.4 ticked "Task 10 —
   * P5 on every new gate" while the pre-filled render had no unit coverage at
   * all, so the whole of Task 0 #54 shipped unexercised.
   *
   * WHY THIS FILE AND NOT AN E2E: #54 is specifically about the SERVER HTML.
   * `defaultValues` is react-hook-form's mechanism and it applies at MOUNT, so
   * without an explicit `defaultValue` on each registered control the SSR paint
   * is EMPTY and the values appear only once hydration lands — a visible flash
   * of a blank form on the one page the buyer arrived at expecting their context
   * to be there. An e2e runs after hydration and cannot see the difference;
   * `renderToStaticMarkup` is exactly the pre-hydration snapshot.
   */
  function prefilled(overrides: Partial<RfqPrefill> = {}): RfqPrefill {
    return {
      params: { project: "lng-terminal-fire-gas-upgrade" },
      resolved: { project: "lng-terminal-fire-gas-upgrade" },
      doorway: "project",
      industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
      equipment: [
        { kind: "product", slug: "fd-9500", label: "Flame Detector X1" },
        { kind: "category", slug: "flame-detectors", label: "Flame detectors" },
      ],
      equipmentFallback: [false, false],
      ...overrides,
    };
  }

  const renderWith = (prefill: RfqPrefill) =>
    renderToStaticMarkup(
      // `sla={null}` — see the note on `render()` above.
      <RfqForm industries={INDUSTRIES} uiLocale="en" prefill={prefill} sla={null} />,
    );

  it("paints the pre-selected industry into the SERVER markup", () => {
    // P5: delete `defaultValue={prefill?.industry?.slug ?? ""}` from the select
    // and this reddens — `defaultValues` alone leaves the option unselected in
    // the server HTML.
    const html = renderWith(prefilled());
    expect(html).toMatch(/<option value="oil-gas"[^>]*selected/);
  });

  it("paints the ?q= text into the project-description textarea", () => {
    // P5: delete `defaultValue={prefill?.query ?? ""}` from the textarea.
    const html = renderWith(prefilled({ doorway: "search", industry: null, query: "fd9500x" }));
    expect(html).toMatch(/<textarea[^>]*>fd9500x<\/textarea>/);
  });

  it("emits one INDIVIDUALLY removable chip per pre-loaded catalog item", () => {
    const html = renderWith(prefilled());
    // The mocked translator renders `key:values`, so the accessible name of each
    // remove button carries the label it belongs to — which is also the
    // "Remove undefined" regression guard: a chip read through `.text` instead
    // of `labelOf` would render the literal string "undefined" here.
    expect(html).toContain("equipmentRemove:Flame Detector X1");
    expect(html).toContain("equipmentRemove:Flame detectors");
    expect(html).not.toContain("undefined");
  });

  it("a NO-prefill render emits no chips and no banner — the other half of the pair", () => {
    // Without this, "render chips unconditionally" would pass the test above.
    const html = render();
    expect(html).not.toContain("equipmentRemove:");
    expect(html).not.toContain("rfq-prefill-banner");
  });

  it("renders NO banner when the doorway resolved nothing, but still mounts the form", () => {
    // The 3.4 review's split: params survive for attribution while `doorway` is
    // null, so AC2's "no empty banner, no placeholder text" must hold on a model
    // that EXISTS. P5: gate the banner on `activePrefill` alone — reddens.
    const html = renderWith({
      params: { project: "zzq-marker-7f3" },
      resolved: {},
      doorway: null,
      industry: null,
      equipment: [],
      equipmentFallback: [],
    });
    expect(html).not.toContain("rfq-prefill-banner");
    expect(html).toContain("rfq-industry");
  });
});
