import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Operational-settings actions (Story 4.8). Guard/revalidate/repos mocked. Proves
 * the schema boundary (EN required, valid email, non-empty reorder), the correct
 * purge tag per action (`settings` vs `sla`, and NONE implicitly for notify since
 * it rides the same `settings` write), and that TR/RU partial locale rows are
 * dropped rather than written as invalid partial translations.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  revalidateTags: (t: readonly string[]) => revalidateTags(t),
}));
const site = { updateSiteSettings: vi.fn() };
vi.mock("@/server/repositories/site-settings", () => ({
  updateSiteSettings: (...a: unknown[]) => site.updateSiteSettings(...a),
}));
const sla = { updateSlaProcessText: vi.fn(), updateSlaStepText: vi.fn(), reorderSlaSteps: vi.fn() };
vi.mock("@/server/repositories/sla", () => ({
  updateSlaProcessText: (...a: unknown[]) => sla.updateSlaProcessText(...a),
  updateSlaStepText: (...a: unknown[]) => sla.updateSlaStepText(...a),
  reorderSlaSteps: (...a: unknown[]) => sla.reorderSlaSteps(...a),
}));

const {
  updateSiteSettingsAction,
  updateSlaProcessTextAction,
  updateSlaStepTextAction,
  reorderSlaStepsAction,
} = await import("./actions");

beforeEach(() => {
  revalidateTags.mockReset();
  site.updateSiteSettings.mockReset();
  Object.values(sla).forEach((f) => f.mockReset());
});

describe("updateSiteSettingsAction", () => {
  it("forwards the supplied values and purges `settings`", async () => {
    // Blank→null normalization is `updateSiteSettings`'s job (via `suppliedValue`,
    // proven in the reader integration test) — the action forwards the parsed
    // values as-is, so only the supplied ones are asserted here.
    site.updateSiteSettings.mockResolvedValue(undefined);
    const r = await updateSiteSettingsAction({
      contactEmail: "ops@glh.example",
      rfqNotifyTo: "notify@glh.example",
      phone: "+902121234567",
      phoneDisplay: "+90 212 123 45 67",
    });
    expect(r).toEqual({ ok: true, data: { ok: true } });
    expect(site.updateSiteSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        contactEmail: "ops@glh.example",
        rfqNotifyTo: "notify@glh.example",
        phone: "+902121234567",
        phoneDisplay: "+90 212 123 45 67",
      }),
    );
    expect(revalidateTags).toHaveBeenCalledWith(["settings"]);
  });

  it("rejects an invalid email at the schema boundary (no write)", async () => {
    const r = await updateSiteSettingsAction({ contactEmail: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation_failed");
    expect(site.updateSiteSettings).not.toHaveBeenCalled();
  });
});

describe("updateSlaProcessTextAction", () => {
  it("writes EN (required) and DROPS a partially-filled TR row; purges `sla`", async () => {
    sla.updateSlaProcessText.mockResolvedValue(undefined);
    const r = await updateSlaProcessTextAction({
      processId: "p1",
      kickerEn: "How it works",
      summaryEn: "Review in 24h.",
      kickerTr: "Nasıl çalışır", // TR summary missing → TR row dropped (EN fallback)
    });
    expect(r).toEqual({ ok: true, data: { ok: true } });
    expect(sla.updateSlaProcessText).toHaveBeenCalledWith("p1", [
      { locale: "en", kicker: "How it works", summary: "Review in 24h." },
    ]);
    expect(revalidateTags).toHaveBeenCalledWith(["sla"]);
  });

  it("writes a COMPLETE TR row alongside EN", async () => {
    sla.updateSlaProcessText.mockResolvedValue(undefined);
    await updateSlaProcessTextAction({
      processId: "p1",
      kickerEn: "How it works",
      summaryEn: "Review in 24h.",
      kickerTr: "Nasıl çalışır",
      summaryTr: "24 saatte inceleme.",
    });
    expect(sla.updateSlaProcessText).toHaveBeenCalledWith("p1", [
      { locale: "en", kicker: "How it works", summary: "Review in 24h." },
      { locale: "tr", kicker: "Nasıl çalışır", summary: "24 saatte inceleme." },
    ]);
  });

  it("rejects a missing EN field (no write)", async () => {
    const r = await updateSlaProcessTextAction({ processId: "p1", kickerEn: "x" }); // summaryEn missing
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation_failed");
    expect(sla.updateSlaProcessText).not.toHaveBeenCalled();
  });
});

describe("updateSlaStepTextAction", () => {
  it("writes a step's EN badge/title/description and purges `sla`", async () => {
    sla.updateSlaStepText.mockResolvedValue(undefined);
    const r = await updateSlaStepTextAction({
      stepId: "s1",
      badgeEn: "24h",
      titleEn: "Technical review",
      descriptionEn: "We assess the spec.",
    });
    expect(r).toEqual({ ok: true, data: { ok: true } });
    expect(sla.updateSlaStepText).toHaveBeenCalledWith("s1", [
      { locale: "en", badge: "24h", title: "Technical review", description: "We assess the spec." },
    ]);
    expect(revalidateTags).toHaveBeenCalledWith(["sla"]);
  });
});

describe("reorderSlaStepsAction", () => {
  it("reorders and purges `sla`", async () => {
    sla.reorderSlaSteps.mockResolvedValue(undefined);
    const r = await reorderSlaStepsAction({ orderedStepIds: ["s2", "s1", "s3"] });
    expect(r).toEqual({ ok: true, data: { ok: true } });
    expect(sla.reorderSlaSteps).toHaveBeenCalledWith(["s2", "s1", "s3"]);
    expect(revalidateTags).toHaveBeenCalledWith(["sla"]);
  });

  it("rejects an empty order (no write)", async () => {
    const r = await reorderSlaStepsAction({ orderedStepIds: [] });
    expect(r.ok).toBe(false);
    expect(sla.reorderSlaSteps).not.toHaveBeenCalled();
  });
});
