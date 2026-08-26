import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The RFQ handler's response contract (Story 3.2, AC3/AC4) — the media-route
 * mock recipe: repositories are mocked, so this asserts the HANDLER's decisions,
 * not Prisma's. The centrepiece is the create-args assertion: `toEqual` is
 * exact over own enumerable keys, so it simultaneously proves what IS written
 * (every AC4 column) and what is NOT (`reference`, `status`, `source`,
 * `prefillContext`, all six attachment columns — absent keys, not null keys).
 */

// Same stub as robots.test.ts — next-intl's navigation entry cannot resolve
// under vitest; the route pulls it in transitively via @/lib/seo (siteOrigin).
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    href === "/" ? `/${locale}` : `/${locale}${href}`,
}));

const createLead = vi.fn();
const listIndustries = vi.fn();
const getProductBySlug = vi.fn();
const listCategoryTree = vi.fn();

vi.mock("@/server/repositories/lead", () => ({
  createLead: (data: unknown) => createLead(data),
}));
vi.mock("@/server/repositories/industry", () => ({
  listIndustries: (locale: string) => listIndustries(locale),
}));
vi.mock("@/server/repositories/product", () => ({
  getProductBySlug: (slug: string, locale: string) => getProductBySlug(slug, locale),
}));
vi.mock("@/server/repositories/category", () => ({
  listCategoryTree: (locale: string) => listCategoryTree(locale),
}));

const { POST } = await import("./route");

/** SITE_URL is unset under vitest, so `siteOrigin()` is the dev origin. */
const SELF_ORIGIN = "http://localhost:3000";

const VALID = {
  name: "Elena Petrova",
  company: "Enka EPC",
  email: "elena@enka.example",
  locale: "ru",
  uiLocale: "en",
  consent: true,
} as const;

function post(
  body: unknown,
  init: { contentType?: string | null; origin?: string; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(init.headers);
  if (init.contentType !== null) {
    headers.set("content-type", init.contentType ?? "application/json");
  }
  if (init.origin) headers.set("origin", init.origin);
  return POST(
    new Request(`${SELF_ORIGIN}/api/rfq`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function errorOf(res: Response) {
  return (await res.json()).error as {
    code: string;
    message: string;
    details?: { path: string; key: string }[];
  };
}

beforeEach(() => {
  createLead.mockReset();
  listIndustries.mockReset();
  getProductBySlug.mockReset();
  listCategoryTree.mockReset();
  createLead.mockResolvedValue({ reference: "GLH-RFQ-2042" });
  listIndustries.mockResolvedValue([{ slug: "fire-safety" }, { slug: "oil-gas" }]);
  getProductBySlug.mockResolvedValue(null);
  listCategoryTree.mockResolvedValue([]);
});

describe("POST /api/rfq — guard chain", () => {
  it("415s any non-JSON content type BEFORE reading the body", async () => {
    const res = await post("field=value", { contentType: "multipart/form-data" });
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe("unsupported_media_type");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("accepts application/json WITH parameters (charset)", async () => {
    const res = await post(VALID, { contentType: "application/json; charset=utf-8" });
    expect(res.status).toBe(201);
  });

  it("403s a present-and-mismatched Origin, and writes nothing", async () => {
    const res = await post(VALID, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("invalid_origin");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("allows the matching Origin and the ABSENT Origin (curl, e2e)", async () => {
    expect((await post(VALID, { origin: SELF_ORIGIN })).status).toBe(201);
    expect((await post(VALID)).status).toBe(201);
  });

  it("413s a declared-oversize Content-Length without reading the body", async () => {
    const res = await post(VALID, { headers: { "content-length": String(65 * 1024) } });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("payload_too_large");
  });

  it("413s an actually-oversize body even without a Content-Length header", async () => {
    const res = await post({ ...VALID, projectDetails: "x".repeat(70 * 1024) });
    expect(res.status).toBe(413);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("422s malformed JSON as invalid_body (the revalidate precedent, not 400)", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("invalid_body");
  });

  it("422s a zod failure with { path, key } details — keys, never English", async () => {
    const res = await post({ ...VALID, name: "", email: "not-an-email" });
    expect(res.status).toBe(422);
    const error = await errorOf(res);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toContainEqual({ path: "name", key: "required" });
    expect(error.details).toContainEqual({ path: "email", key: "email" });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("consent: false → 422 and NO row (the create is unreachable)", async () => {
    const res = await post({ ...VALID, consent: false });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toContainEqual({
      path: "consent",
      key: "consentRequired",
    });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("rejects an industry slug that is not a real PID industry", async () => {
    const res = await post({ ...VALID, industry: "not-a-real-industry" });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toEqual([{ path: "industry", key: "invalid" }]);
    expect(createLead).not.toHaveBeenCalled();
  });
});

describe("POST /api/rfq — the create-args centrepiece (AC4)", () => {
  it("writes exactly the AC4 column map — and nothing else", async () => {
    getProductBySlug.mockResolvedValue({ name: "Flame Detector X1" });
    listCategoryTree.mockResolvedValue([
      {
        slug: "fire-gas-detection",
        name: "Fire & Gas Detection",
        children: [{ slug: "flame-detectors", name: "Flame Detectors", children: [] }],
      },
    ]);

    const before = Date.now();
    const res = await post({
      ...VALID,
      industry: "fire-safety",
      timeline: "1-3m",
      equipment: [
        { kind: "product", slug: "detector-x", label: "stale client label" },
        { kind: "category", slug: "flame-detectors", label: "stale client label" },
        { kind: "freeText", text: "20 t overhead crane" },
      ],
      projectDetails: "Terminal fire & gas upgrade, NFPA 72.",
      quantities: "12 detectors, 2 panels",
      phone: "+90 212 000 00 00",
      country: "Türkiye",
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ reference: "GLH-RFQ-2042" });
    expect(createLead).toHaveBeenCalledTimes(1);

    const args = createLead.mock.calls[0][0];
    expect(args).toEqual({
      industry: "fire-safety",
      equipment: [
        // Catalog labels are SERVER-RESOLVED at submit time — the client's
        // stale labels must not survive; freeText is the buyer's, verbatim.
        { kind: "product", slug: "detector-x", label: "Flame Detector X1" },
        { kind: "category", slug: "flame-detectors", label: "Flame Detectors" },
        { kind: "freeText", text: "20 t overhead crane" },
      ],
      projectDetails: "Terminal fire & gas upgrade, NFPA 72.",
      quantities: "12 detectors, 2 panels",
      timeline: "1-3m",
      company: "Enka EPC",
      name: "Elena Petrova",
      email: "elena@enka.example",
      phone: "+90 212 000 00 00",
      country: "Türkiye",
      locale: "ru",
      consent: true,
      consentAt: expect.any(Date),
      consentVersion: "privacy-2026-08-stub:en",
    });
    // Server-stamped, never client time.
    expect((args.consentAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    // Labels resolved in the BUYER'S reply locale (what 3.3's emails cite).
    expect(getProductBySlug).toHaveBeenCalledWith("detector-x", "ru");
    expect(listCategoryTree).toHaveBeenCalledWith("ru");
  });

  it("minimal payload: optional columns are null, equipment [], source/reference absent", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(createLead.mock.calls[0][0]).toEqual({
      industry: null,
      equipment: [],
      projectDetails: null,
      quantities: null,
      timeline: null,
      company: "Enka EPC",
      name: "Elena Petrova",
      email: "elena@enka.example",
      phone: null,
      country: null,
      locale: "ru",
      consent: true,
      consentAt: expect.any(Date),
      consentVersion: "privacy-2026-08-stub:en",
    });
  });

  it("a body smuggling source/reference/status/consentAt/attachments still writes the defaults", async () => {
    const res = await post({
      ...VALID,
      source: "project",
      reference: "GLH-RFQ-9999",
      status: "quoted",
      consentAt: "1999-01-01T00:00:00.000Z",
      consentVersion: "forged",
      attachmentKey: "evil",
      website: "https://filled-by-a-bot.example",
    });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    // Stripped by the schema, excluded by LeadCreateData — absent, not null.
    expect(args).not.toHaveProperty("source");
    expect(args).not.toHaveProperty("reference");
    expect(args).not.toHaveProperty("status");
    expect(args).not.toHaveProperty("prefillContext");
    expect(args).not.toHaveProperty("attachmentKey");
    expect(args).not.toHaveProperty("website");
    expect(args.consentVersion).toBe("privacy-2026-08-stub:en");
    expect((args.consentAt as Date).getFullYear()).toBeGreaterThan(2000);
  });

  it("keeps the client label when a catalog slug no longer resolves", async () => {
    getProductBySlug.mockResolvedValue(null);
    await post({
      ...VALID,
      equipment: [{ kind: "product", slug: "gone-product", label: "Old detector" }],
    });
    expect(createLead.mock.calls[0][0].equipment).toEqual([
      { kind: "product", slug: "gone-product", label: "Old detector" },
    ]);
  });

  it("500s with the envelope when the insert itself fails — and says so honestly", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createLead.mockRejectedValue(new Error("connection refused"));
    const res = await post(VALID);
    expect(res.status).toBe(500);
    expect((await errorOf(res)).code).toBe("internal_error");
    consoleError.mockRestore();
  });
});
