// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifySessionToken } from "./session";

/**
 * The session JWT (Story 4.1, AC1) — sign/verify, and the failure modes that
 * MUST return null (tampered, expired, wrong key, wrong alg) or throw
 * (missing/short secret — fail closed).
 */
const GOOD_SECRET = "test-secret-that-is-definitely-at-least-32-bytes-long!!";
const original = process.env.AUTH_SECRET;

beforeAll(() => {
  process.env.AUTH_SECRET = GOOD_SECRET;
});
afterAll(() => {
  process.env.AUTH_SECRET = original;
});

describe("admin session token", () => {
  it("round-trips the admin id", async () => {
    // P5: break the sub claim wiring and this reddens.
    const token = await signSession("admin-123");
    expect(await verifySessionToken(token)).toEqual({ sub: "admin-123" });
  });

  it("rejects a tampered token", async () => {
    // P5: if jwtVerify's signature check were bypassed this would pass.
    const token = await signSession("admin-123");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a token signed with a DIFFERENT key", async () => {
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin-123")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-totally-different-secret-32-bytes-min-xxxxx"));
    expect(await verifySessionToken(foreign)).toBeNull();
  });

  it("rejects an expired token", async () => {
    // Hand-sign with an exp in the past using the SAME key.
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin-123")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(GOOD_SECRET));
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("rejects an empty/absent token without throwing", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("FAILS CLOSED when AUTH_SECRET is missing or too short", async () => {
    // P5: soften the length guard and this stops throwing.
    process.env.AUTH_SECRET = "too-short";
    await expect(signSession("x")).rejects.toThrow(/AUTH_SECRET/);
    delete process.env.AUTH_SECRET;
    await expect(signSession("x")).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = GOOD_SECRET;
  });
});
