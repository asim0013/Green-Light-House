// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  queryHomeContent,
  getHomeContentForEdit,
  updateHomeContent,
  type HomeContentEditData,
} from "./home-content";
import {
  createTeamMember,
  getTeamMemberForEdit,
  updateTeamMember,
  deleteTeamMember,
  listTeamMembers,
} from "./team";

/**
 * Story 4.4b writes against real Postgres. HomeContent is a SEEDED singleton, so
 * this snapshots it and RESTORES it in afterAll (the site-settings precedent) —
 * never leaving the dev homepage clobbered. Team rows are tracked by id and
 * deleted. Skips locally if the DB is unreachable, throws in CI.
 */
let dbReachable = true;
let homeSnapshot: HomeContentEditData | null = null;
const createdTeamIds: string[] = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    homeSnapshot = await getHomeContentForEdit();
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) {
    for (const id of createdTeamIds) await prisma.teamMember.deleteMany({ where: { id } });
    if (homeSnapshot) await updateHomeContent(homeSnapshot); // restore the seeded homepage
  }
  await prisma.$disconnect();
});

describe("home content singleton", () => {
  it("round-trips editable copy; a missing locale falls back to EN", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await updateHomeContent({
      certMarks: ["ISO 9001", "CE"],
      translations: [
        { locale: "en", title: "EN title", kicker: "EN kicker" },
        { locale: "tr", title: "TR title" },
      ],
    });

    const en = await queryHomeContent("en");
    expect(en?.title).toBe("EN title");
    expect(en?.certMarks).toEqual(["ISO 9001", "CE"]);
    expect(en?.isFallback).toBe(false);

    // RU has no row → falls back to EN.
    const ru = await queryHomeContent("ru");
    expect(ru?.title).toBe("EN title");
    expect(ru?.isFallback).toBe(true);

    // A field left unset on EN reads as null (the homepage then uses its messages fallback).
    expect(en?.manufacturersTitle).toBeNull();

    const edit = await getHomeContentForEdit();
    expect(edit.certMarks).toEqual(["ISO 9001", "CE"]);
    expect(edit.translations.map((t) => t.locale).sort()).toEqual(["en", "tr"]);
  });
});

describe("team members", () => {
  it("creates, edits (clearing a locale), reorders, and deletes", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id } = await createTeamMember({
      order: 5,
      translations: [
        { locale: "en", name: "Aylin", role: "Operations", bio: "EN bio" },
        { locale: "ru", name: "Айлин", role: null, bio: null },
      ],
    });
    createdTeamIds.push(id);

    const created = await getTeamMemberForEdit(id);
    expect(created?.order).toBe(5);
    expect(created?.translations.map((t) => t.locale).sort()).toEqual(["en", "ru"]);

    // Edit: change order, drop the RU row.
    const ok = await updateTeamMember(id, 1, [
      { locale: "en", name: "Aylin", role: "Ops", bio: null },
    ]);
    expect(ok).toBe(true);
    const edited = await getTeamMemberForEdit(id);
    expect(edited?.order).toBe(1);
    expect(edited?.translations.map((t) => t.locale)).toEqual(["en"]);
    expect(edited?.translations[0].role).toBe("Ops");

    // Appears in the ordered admin list with the EN name.
    const list = await listTeamMembers("tr"); // no TR row → EN fallback name
    expect(list.find((m) => m.id === id)?.name).toBe("Aylin");

    await deleteTeamMember(id);
    expect(await getTeamMemberForEdit(id)).toBeNull();
  });
});
