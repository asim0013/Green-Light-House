// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hashSecret, verifySecret } from "./password";

/**
 * argon2id hashing via hash-wasm (Story 4.1). Proves a hash verifies against the
 * right secret, rejects the wrong one, salts (two hashes of the same input
 * differ), and never throws on a malformed hash.
 */
describe("password hashing (argon2id / hash-wasm)", () => {
  it("verifies the correct secret and rejects a wrong one", async () => {
    // P5: return a constant from verifySecret and the wrong-password line reddens.
    const hash = await hashSecret("correct horse battery staple");
    expect(await verifySecret("correct horse battery staple", hash)).toBe(true);
    expect(await verifySecret("wrong password", hash)).toBe(false);
  });

  it("salts — the same input hashes to different encoded strings", async () => {
    const a = await hashSecret("same-input");
    const b = await hashSecret("same-input");
    expect(a).not.toBe(b);
    expect(await verifySecret("same-input", a)).toBe(true);
    expect(await verifySecret("same-input", b)).toBe(true);
  });

  it("returns false (never throws) on a malformed hash", async () => {
    // A corrupt row must be a failed login, not a 500.
    expect(await verifySecret("x", "not-an-argon2-hash")).toBe(false);
    expect(await verifySecret("x", "")).toBe(false);
  });
});
