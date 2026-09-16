import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The in-process revalidation helper (Story 4.3). `next/cache` is mocked so the
 * test asserts the CONTRACT the admin mutations depend on: every tag is passed
 * to `revalidateTag` with the `"max"` profile, in order, once each.
 */
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string, profile: string) => revalidateTag(tag, profile),
}));

const { revalidateTags } = await import("./revalidate");

beforeEach(() => revalidateTag.mockClear());

describe("revalidateTags", () => {
  it("forwards each tag to revalidateTag with the max profile", () => {
    // P5: drop the second arg in the impl and this reddens (profile !== "max").
    revalidateTags(["catalog", "product:abc123"]);
    expect(revalidateTag.mock.calls).toEqual([
      ["catalog", "max"],
      ["product:abc123", "max"],
    ]);
  });

  it("is a no-op for an empty tag list", () => {
    // P5: a stray unconditional call in the impl would make this fail.
    revalidateTags([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
