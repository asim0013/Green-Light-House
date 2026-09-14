// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Reset non-enumeration (Story 4.1 review finding). The unknown-email path must
 * cost the SAME argon2 hash as the known path, or response timing leaks whether
 * the admin account exists. Proven by mocking the repo to report "no such
 * admin" and asserting `hashSecret` still ran.
 */
const hashSecret = vi.fn(async () => "argon2-encoded");
const verifySecret = vi.fn(async () => false);
const findResetStateByEmail = vi.fn();
const setResetToken = vi.fn(async () => {});
const completeReset = vi.fn(async () => {});

vi.mock("./password", () => ({ hashSecret, verifySecret }));
vi.mock("@/server/repositories/admin-user", () => ({
  findResetStateByEmail,
  setResetToken,
  completeReset,
}));

const { issueReset } = await import("./reset");

beforeEach(() => {
  hashSecret.mockClear();
  setResetToken.mockClear();
});

describe("issueReset — equal cost on both paths (no timing enumeration)", () => {
  it("runs the argon2 hash even when the email is unknown (the timing burn)", async () => {
    // P5: restore the early `return null` before the hash and this reddens —
    // the unknown path would skip hashSecret and be measurably faster.
    findResetStateByEmail.mockResolvedValueOnce(null);
    const token = await issueReset("nobody@example.com");
    expect(token).toBeNull();
    expect(hashSecret).toHaveBeenCalledTimes(1); // burned, then discarded
    expect(setResetToken).not.toHaveBeenCalled(); // but nothing persisted
  });

  it("hashes and persists for a known email, returning the raw token once", async () => {
    findResetStateByEmail.mockResolvedValueOnce({
      id: "a1",
      resetTokenHash: null,
      resetExpiresAt: null,
    });
    const token = await issueReset("admin@example.com");
    expect(typeof token).toBe("string");
    expect(hashSecret).toHaveBeenCalledTimes(1);
    expect(setResetToken).toHaveBeenCalledTimes(1);
  });
});
