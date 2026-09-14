// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { verifyCredential } from "@/lib/auth/login";
import { issueReset, consumeReset } from "@/lib/auth/reset";
import { hashSecret } from "@/lib/auth/password";
import { createAdmin, setResetToken, findAdminByEmail } from "./admin-user";

/**
 * Admin auth end-to-end against the DB (Story 4.1). Credential verification and
 * the reset lifecycle need a real `admin_users` row, so they run here. Self-seed
 * a throwaway admin, clean up after; CI never skips (retro T6), local skips
 * cleanly without a DB.
 */
const EMAIL = "zzz-int-test-admin@example.com";
const PASSWORD = "correct-horse-battery-staple-01";
let dbReachable = false;
let adminId = "";

async function cleanup() {
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: "zzz-int-test-admin" } } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
    const { id } = await createAdmin(EMAIL, await hashSecret(PASSWORD));
    adminId = id;
    dbReachable = true;
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await prisma.$disconnect();
});

describe("credential verification (non-enumerable)", () => {
  it("accepts the correct email + password", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await verifyCredential(EMAIL, PASSWORD)).toEqual({ id: adminId });
  });

  it("rejects a wrong password", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // P5: return the admin id regardless of the verify result → this reddens.
    expect(await verifyCredential(EMAIL, "wrong-password")).toBeNull();
  });

  it("rejects an unknown email the SAME way (no enumeration)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Same null result as a wrong password — the handler cannot tell them apart.
    expect(await verifyCredential("zzz-int-test-admin-nobody@example.com", PASSWORD)).toBeNull();
  });

  it("stores the email lowercased and matches case-insensitively", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await verifyCredential(EMAIL.toUpperCase(), PASSWORD)).toEqual({ id: adminId });
    expect(await findAdminByEmail(EMAIL)).not.toBeNull();
  });
});

describe("reset lifecycle (single-use, expiring, hashed)", () => {
  it("issues a token for a known email and null for an unknown one", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await issueReset("zzz-int-test-admin-nobody@example.com")).toBeNull();
    const token = await issueReset(EMAIL);
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(20);
  });

  it("consumes a valid token exactly once, then the new password works", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const token = (await issueReset(EMAIL))!;
    // P5: revert completeReset to not clear the token → the second consume passes.
    expect(await consumeReset(EMAIL, token, "a-brand-new-strong-password")).toBe(true);
    expect(await consumeReset(EMAIL, token, "another-attempt-password")).toBe(false); // single-use
    expect(await verifyCredential(EMAIL, "a-brand-new-strong-password")).toEqual({ id: adminId });
  });

  it("rejects a wrong token and an expired token", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await issueReset(EMAIL);
    expect(await consumeReset(EMAIL, "not-the-real-token", "pw-should-not-apply-here")).toBe(false);
    // Force an expired reset and confirm it is refused.
    await setResetToken(adminId, await hashSecret("expired-token"), new Date(Date.now() - 1000));
    expect(await consumeReset(EMAIL, "expired-token", "pw-should-not-apply-here")).toBe(false);
  });
});
