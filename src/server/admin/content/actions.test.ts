import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Content server actions (Story 4.4) — the per-entity purge sets + domain-error
 * mapping on top of the shared wrapper. Guard/revalidate/repos mocked; the tests
 * pin: industry refuses delete while referenced; a service busts every linked
 * industry tag; a project busts old+new industry tags.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  revalidateTags: (t: readonly string[]) => revalidateTags(t),
}));

const ind = {
  createIndustry: vi.fn(),
  updateIndustryTranslations: vi.fn(),
  industryReferenceCounts: vi.fn(),
  deleteIndustry: vi.fn(),
};
vi.mock("@/server/repositories/industry", () => ({
  createIndustry: (...a: unknown[]) => ind.createIndustry(...a),
  updateIndustryTranslations: (...a: unknown[]) => ind.updateIndustryTranslations(...a),
  industryReferenceCounts: (...a: unknown[]) => ind.industryReferenceCounts(...a),
  deleteIndustry: (...a: unknown[]) => ind.deleteIndustry(...a),
}));

const svc = {
  updateServiceTranslations: vi.fn(),
  serviceLinkedIndustrySlugs: vi.fn(),
  createService: vi.fn(),
  deleteService: vi.fn(),
};
vi.mock("@/server/repositories/service", () => ({
  updateServiceTranslations: (...a: unknown[]) => svc.updateServiceTranslations(...a),
  serviceLinkedIndustrySlugs: (...a: unknown[]) => svc.serviceLinkedIndustrySlugs(...a),
  createService: (...a: unknown[]) => svc.createService(...a),
  deleteService: (...a: unknown[]) => svc.deleteService(...a),
}));

const proj = { updateProject: vi.fn(), createProject: vi.fn(), deleteProject: vi.fn() };
vi.mock("@/server/repositories/project", () => ({
  updateProject: (...a: unknown[]) => proj.updateProject(...a),
  createProject: (...a: unknown[]) => proj.createProject(...a),
  deleteProject: (...a: unknown[]) => proj.deleteProject(...a),
}));

const home = { updateHomeContent: vi.fn() };
vi.mock("@/server/repositories/home-content", () => ({
  updateHomeContent: (...a: unknown[]) => home.updateHomeContent(...a),
}));

const team = { createTeamMember: vi.fn(), updateTeamMember: vi.fn(), deleteTeamMember: vi.fn() };
vi.mock("@/server/repositories/team", () => ({
  createTeamMember: (...a: unknown[]) => team.createTeamMember(...a),
  updateTeamMember: (...a: unknown[]) => team.updateTeamMember(...a),
  deleteTeamMember: (...a: unknown[]) => team.deleteTeamMember(...a),
}));

const { updateIndustryAction, deleteIndustryAction } = await import("./industry-actions");
const { updateServiceAction } = await import("./service-actions");
const { updateProjectAction } = await import("./project-actions");
const { updateHomeContentAction } = await import("./home-actions");
const { createTeamMemberAction, deleteTeamMemberAction } = await import("./team-actions");

beforeEach(() => {
  revalidateTags.mockReset();
  [ind, svc, proj, home, team].forEach((g) => Object.values(g).forEach((f) => f.mockReset()));
});

describe("industry actions", () => {
  it("update busts industries + industry:{slug}", async () => {
    ind.updateIndustryTranslations.mockResolvedValue("oil-gas");
    const r = await updateIndustryAction({ id: "i1", nameEn: "Oil & Gas" });
    expect(r.ok).toBe(true);
    expect(revalidateTags).toHaveBeenCalledWith(["industries", "industry:oil-gas"]);
  });

  it("refuses delete while referenced (in_use) and does not delete", async () => {
    ind.industryReferenceCounts.mockResolvedValue({
      products: 4,
      documents: 0,
      services: 1,
      projects: 2,
    });
    const r = await deleteIndustryAction("i1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("in_use");
    expect(ind.deleteIndustry).not.toHaveBeenCalled();
  });
});

describe("service actions", () => {
  it("update busts services + every linked industry tag", async () => {
    svc.serviceLinkedIndustrySlugs.mockResolvedValue(["oil-gas", "marine"]);
    svc.updateServiceTranslations.mockResolvedValue(true);
    const r = await updateServiceAction({ id: "s1", nameEn: "Commissioning" });
    expect(r.ok).toBe(true);
    expect(revalidateTags).toHaveBeenCalledWith([
      "services",
      "industry:oil-gas",
      "industry:marine",
    ]);
  });
});

describe("project actions", () => {
  it("update busts projects + project:{slug} + old and new industry tags", async () => {
    proj.updateProject.mockResolvedValue({
      ok: true,
      slug: "marmara-lng",
      industrySlugs: ["oil-gas", "marine"],
    });
    const r = await updateProjectAction({ id: "p1", status: "published", titleEn: "Marmara LNG" });
    expect(r.ok).toBe(true);
    expect(revalidateTags).toHaveBeenCalledWith([
      "projects",
      "project:marmara-lng",
      "industry:oil-gas",
      "industry:marine",
    ]);
  });
});

describe("home content action", () => {
  it("saves and busts the home tag", async () => {
    home.updateHomeContent.mockResolvedValue(undefined);
    const r = await updateHomeContentAction({ titleEn: "Hi", certMarks: ["ISO 9001"] });
    expect(r.ok).toBe(true);
    expect(home.updateHomeContent).toHaveBeenCalled();
    expect(revalidateTags).toHaveBeenCalledWith(["home"]);
  });
});

describe("team actions", () => {
  it("create busts the team tag", async () => {
    team.createTeamMember.mockResolvedValue({ id: "t1" });
    const r = await createTeamMemberAction({ nameEn: "Aylin", order: 0 });
    expect(r).toEqual({ ok: true, data: { id: "t1" } });
    expect(revalidateTags).toHaveBeenCalledWith(["team"]);
  });

  it("delete busts the team tag", async () => {
    team.deleteTeamMember.mockResolvedValue(undefined);
    const r = await deleteTeamMemberAction("t1");
    expect(r.ok).toBe(true);
    expect(team.deleteTeamMember).toHaveBeenCalledWith("t1");
    expect(revalidateTags).toHaveBeenCalledWith(["team"]);
  });
});
