// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  createLead,
  listLeadsForAdmin,
  getLeadForAdmin,
  getServableLeadAttachment,
  listLeadsForExport,
  updateLeadStatus,
  deleteLeadWithAttachment,
} from "./lead";

/**
 * Story 4.7 is a VERIFICATION story (Epic 3 retro T8): the first real reader of
 * the write-side Lead model. This proves the detail projection reads back a
 * fully-populated lead — equipment union, prefillContext, a clean attachment,
 * send-state — via the frozen parsers, and that status/erasure work. Temp rows
 * tracked + removed. `deleteObject` is idempotent, so the synthetic quarantine
 * key deletes cleanly. Skips locally if the DB is unreachable, throws in CI.
 */
let dbReachable = true;
const leadIds: string[] = [];
const uid = () => globalThis.crypto.randomUUID();

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) for (const id of leadIds) await prisma.lead.deleteMany({ where: { id } });
  await prisma.$disconnect();
});

async function makeLead() {
  const { id } = await createLead({
    company: "Acme, Inc",
    name: "Aylin",
    email: "aylin@example.com",
    phone: "+90 555 000",
    country: "TR",
    locale: "en",
    industry: "oil-gas",
    equipment: [
      { kind: "product", slug: "fd-9500", label: "FD-9500" },
      { kind: "freeText", text: "custom skid" },
    ] as unknown as Prisma.InputJsonValue,
    projectDetails: "=danger", // formula-shaped free text — must survive as data
    quantities: "12",
    timeline: "Q3",
    consent: true,
    consentAt: new Date(),
    consentVersion: "1:en",
    source: "product",
    prefillContext: {
      resolved: { product: "fd-9500" },
      cleared: false,
      edited: true,
    } as unknown as Prisma.InputJsonValue,
    attachmentKey: `quarantine/${uid()}.pdf`,
    attachmentName: "spec.pdf",
    attachmentMime: "application/pdf",
    attachmentSizeBytes: 2048,
    attachmentScanStatus: "clean",
    attachmentScannedAt: new Date(),
  });
  leadIds.push(id);
  return id;
}

describe("admin lead reads (verification)", () => {
  it("projects every captured field via the frozen parsers", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const id = await makeLead();
    // Simulate a terminal notify failure recorded after send (send-state columns).
    await prisma.lead.update({
      where: { id },
      data: { notifiedAt: new Date(), deliveryFailureReason: "confirm:transport" },
    });

    const lead = await getLeadForAdmin(id);
    expect(lead?.reference).toMatch(/^GLH-RFQ-\d+$/);
    expect(lead?.source).toBe("product");
    expect(lead?.prefillContext.resolved.product).toBe("fd-9500");
    expect(lead?.prefillContext.edited).toBe(true);
    expect(lead?.equipment.map((e) => (e.kind === "freeText" ? e.text : e.label))).toEqual([
      "FD-9500",
      "custom skid",
    ]);
    expect(lead?.projectDetails).toBe("=danger");
    expect(lead?.deliveryFailureReason).toBe("confirm:transport");
    // Attachment projected as a clean view WITH an href and WITHOUT any storage key.
    expect(lead?.attachment.state).toBe("clean");
    if (lead?.attachment.state === "clean") {
      expect(lead.attachment.href).toBe(`/admin/leads/${id}/attachment`);
    }
    expect(JSON.stringify(lead)).not.toContain("quarantine/");
  });

  it("lists newest-first, filters by status, and resolves a servable attachment", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const id = await makeLead();
    const list = await listLeadsForAdmin("new");
    const row = list.find((r) => r.id === id);
    expect(row?.status).toBe("new");
    expect(row?.hasAttachment).toBe(true);

    // The clean attachment resolves a quarantine key server-side (for the route).
    const servable = await getServableLeadAttachment(id);
    expect(servable?.storageKey.startsWith("quarantine/")).toBe(true);

    // Export flattens equipment via labelOf.
    const exportRows = await listLeadsForExport("new");
    expect(exportRows.find((r) => r.reference === row?.reference)?.equipment).toBe(
      "FD-9500; custom skid",
    );
  });

  it("updates status; a non-clean attachment is not servable; erasure removes the lead", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const id = await makeLead();
    expect(await updateLeadStatus(id, "quoted")).toBe(true);
    expect((await getLeadForAdmin(id))?.status).toBe("quoted");

    // Flip to failed → not servable (attachment route would 404).
    await prisma.lead.update({ where: { id }, data: { attachmentScanStatus: "failed" } });
    expect(await getServableLeadAttachment(id)).toBeNull();
    expect((await getLeadForAdmin(id))?.attachment.state).toBe("failed");

    await deleteLeadWithAttachment(id);
    expect(await getLeadForAdmin(id)).toBeNull();
    expect(await updateLeadStatus(id, "closed")).toBe(false); // gone → false, no throw
  });
});
