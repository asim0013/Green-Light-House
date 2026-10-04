import { describe, it, expect } from "vitest";
import { analyticsEnabled, ANALYTICS_SCRIPT_PATH, ANALYTICS_EVENT_PATH } from "./config";

/**
 * Analytics config (Story 5.8). The safe-default-OFF gate and the proxy-matcher-safe
 * paths are the two invariants the rest of the story leans on.
 */
describe("analyticsEnabled", () => {
  it("is on only when a data-domain is configured (safe default = off)", () => {
    expect(analyticsEnabled("greenlighthouse.com")).toBe(true);
    expect(analyticsEnabled("")).toBe(false);
    expect(analyticsEnabled("   ")).toBe(false); // whitespace ⇒ not configured
  });
});

describe("proxied paths dodge the proxy matcher (hazard C2)", () => {
  it("serves the script from a dotted path (.* \\. .* exclusion)", () => {
    expect(ANALYTICS_SCRIPT_PATH).toMatch(/\.js$/);
  });
  it("serves the event endpoint under /api (api exclusion)", () => {
    expect(ANALYTICS_EVENT_PATH.startsWith("/api/")).toBe(true);
  });
});
