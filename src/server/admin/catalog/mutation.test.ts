import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * The admin mutation wrapper (Story 4.3). Guard + revalidate are mocked so the
 * test pins the wrapper's CONTRACT: auth is checked first, validation is
 * server-authoritative, the body runs only on valid input, tags are revalidated
 * only after a successful body, and a MutationError becomes a mapped result.
 */
const requireAdmin = vi.fn();
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => requireAdmin() };
});

const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  revalidateTags: (t: readonly string[]) => revalidateTags(t),
}));

const { withAdminMutation, MutationError } = await import("./mutation");
const { AuthRequiredError } = await import("@/lib/auth/guard");

const schema = z.object({ name: z.string("required").min(1, "required") });

beforeEach(() => {
  requireAdmin.mockReset();
  revalidateTags.mockReset();
  requireAdmin.mockResolvedValue({ sub: "admin-1" });
});

describe("withAdminMutation", () => {
  it("runs the body on valid input and revalidates the returned tags", async () => {
    const body = vi
      .fn()
      .mockResolvedValue({ tags: ["catalog", "manufacturers"], data: { id: "m1" } });
    const result = await withAdminMutation(schema, { name: "Bosch" }, body);
    expect(result).toEqual({ ok: true, data: { id: "m1" } });
    expect(body).toHaveBeenCalledWith({ name: "Bosch" });
    expect(revalidateTags).toHaveBeenCalledWith(["catalog", "manufacturers"]);
  });

  it("rejects an expired session before touching the body", async () => {
    // P5: remove the AuthRequiredError branch and this becomes an unhandled throw.
    requireAdmin.mockRejectedValue(new AuthRequiredError());
    const body = vi.fn();
    const result = await withAdminMutation(schema, { name: "Bosch" }, body);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "unauthorized" }) });
    expect(body).not.toHaveBeenCalled();
    expect(revalidateTags).not.toHaveBeenCalled();
  });

  it("returns validation_failed with field details and does not run the body", async () => {
    // P5: skip safeParse and call the body directly — this reddens (no details, body runs).
    const body = vi.fn();
    const result = await withAdminMutation(schema, { name: "" }, body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_failed");
      expect(result.error.details).toEqual([{ path: "name", key: "required" }]);
    }
    expect(body).not.toHaveBeenCalled();
    expect(revalidateTags).not.toHaveBeenCalled();
  });

  it("maps a MutationError thrown by the body and does NOT revalidate", async () => {
    const body = vi.fn().mockRejectedValue(new MutationError("in_use", "Still referenced."));
    const result = await withAdminMutation(schema, { name: "Bosch" }, body);
    expect(result).toEqual({
      ok: false,
      error: { code: "in_use", message: "Still referenced.", details: undefined },
    });
    expect(revalidateTags).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected error (not swallowed as a result)", async () => {
    const body = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withAdminMutation(schema, { name: "Bosch" }, body)).rejects.toThrow("boom");
  });
});
