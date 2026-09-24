import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useForm, FormProvider } from "react-hook-form";
import { IndustryCheckboxes } from "./IndustryCheckboxes";

/**
 * The industry multi-select (Story 4.6). The code review flagged the EDIT
 * pre-check as unverified: does RHF render the checkboxes CHECKED for the ids in
 * `defaultValues.industryIds`, so an edit-save preserves existing associations
 * rather than silently clearing them? This mounts it in a real RHF form (via
 * `react-dom/client` — no `@testing-library` dependency) and proves both the
 * pre-check and that submit collects the checked ids.
 */
const OPTIONS = [
  { id: "a", name: "Oil & Gas" },
  { id: "b", name: "Marine" },
  { id: "c", name: "Fire safety" },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mount(defaults: string[], onSubmitRef: { current: string[] | null }) {
  function Harness() {
    const form = useForm<{ industryIds: string[] }>({ defaultValues: { industryIds: defaults } });
    return (
      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit((v) => {
            onSubmitRef.current = v.industryIds;
          })}
        >
          <IndustryCheckboxes options={OPTIONS} />
          <button type="submit">save</button>
        </form>
      </FormProvider>
    );
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));
}

function checkedValues(): string[] {
  return [...container!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .filter((b) => b.checked)
    .map((b) => b.value);
}

describe("IndustryCheckboxes", () => {
  it("renders one checkbox per option, none checked when defaults are empty", () => {
    mount([], { current: null });
    expect(container!.querySelectorAll('input[type="checkbox"]').length).toBe(3);
    expect(checkedValues()).toEqual([]);
  });

  it("PRE-CHECKS the boxes whose id is in defaultValues.industryIds (edit page)", () => {
    mount(["b", "c"], { current: null });
    expect(checkedValues().sort()).toEqual(["b", "c"]);
  });

  it("submits the pre-checked ids unchanged (edit-save keeps associations)", async () => {
    const submitted: { current: string[] | null } = { current: null };
    mount(["a", "c"], submitted);
    await act(async () => {
      container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(submitted.current?.sort()).toEqual(["a", "c"]);
  });
});
