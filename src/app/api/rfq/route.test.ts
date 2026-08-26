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

  it("413s an actually-oversize body via the BYTE COUNTER — provably not the header path", async () => {
    // Branch isolation (3.2 review): if the runtime synthesized a
    // Content-Length for the string body, this test would exercise the header
    // short-circuit and the byte counter would be tested by nothing. Assert
    // the precondition so drift in undici's behavior fails loud, not silent.
    const request = new Request(`${SELF_ORIGIN}/api/rfq`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID, projectDetails: "x".repeat(70 * 1024) }),
    });
    expect(request.headers.get("content-length")).toBeNull();
    const res = await POST(request);
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

  it("valid-JSON non-objects ([], null, scalars) are invalid_body — never zod's English", async () => {
    for (const body of ["[]", "null", '"x"', "42"]) {
      const res = await post(body);
      expect(res.status, body).toBe(422);
      const error = await errorOf(res);
      expect(error.code, body).toBe("invalid_body");
    }
    expect(createLead).not.toHaveBeenCalled();
  });

  it("hostile code points 422 as `invalid` — never a 500 at the insert (the 2.5 class)", async () => {
    // Each of these previously passed the whole guard chain and died INSIDE
    // prisma.lead.create (Postgres 22021/22P05, or Prisma's own hex-escape
    // throw for the lone surrogate) — minting the 500 this route reserves for
    // "Postgres down" (3.2 review, HIGH).
    const cases: [string, Record<string, unknown>][] = [
      ["NUL in name", { ...VALID, name: "Elena\u0000Petrova" }],
      ["NUL in freeText", { ...VALID, equipment: [{ kind: "freeText", text: "crane\u0000" }] }],
      ["bidi override in company", { ...VALID, company: "Enka\u202Egpj.exe" }],
      ["lone surrogate in projectDetails", { ...VALID, projectDetails: "x\uD800y" }],
    ];
    for (const [label, payload] of cases) {
      const res = await post(payload);
      expect(res.status, label).toBe(422);
      const error = await errorOf(res);
      expect(error.code, label).toBe("validation_failed");
      expect(
        error.details!.every((d) => d.key === "invalid" || d.key === "required"),
        label,
      ).toBe(true);
    }
    expect(createLead).not.toHaveBeenCalled();
  });
});

describe("POST /api/rfq — Origin canonicalization (3.2 review)", () => {
  const withSiteUrl = async (siteUrl: string, origin: string) => {
    const saved = process.env.SITE_URL;
    process.env.SITE_URL = siteUrl;
    try {
      return await post(VALID, { origin });
    } finally {
      if (saved === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = saved;
    }
  };

  it("legal SITE_URL spellings must not 403 real buyers (case, default port)", async () => {
    // Browsers send Origin lowercased and without default ports; a raw string
    // compare against these legal configs was a silent total funnel outage.
    expect((await withSiteUrl("https://GLH.example", "https://glh.example")).status).toBe(201);
    expect((await withSiteUrl("https://glh.example:443", "https://glh.example")).status).toBe(201);
  });

  it('the literal "null" Origin (opaque context) fails closed', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(VALID, { origin: "null" });
    expect(res.status).toBe(403);
    warn.mockRestore();
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
      consentVersion: "privacy-2026-08-stub-r2:en",
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
      consentVersion: "privacy-2026-08-stub-r2:en",
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
    expect(args.consentVersion).toBe("privacy-2026-08-stub-r2:en");
    expect((args.consentAt as Date).getFullYear()).toBeGreaterThan(2000);
  });

  it("consentVersion carries the ACTUAL uiLocale — a hard-coded ':en' cannot pass (3.2 review)", async () => {
    const res = await post({ ...VALID, uiLocale: "ru" });
    expect(res.status).toBe(201);
    expect(createLead.mock.calls[0][0].consentVersion).toBe("privacy-2026-08-stub-r2:ru");
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
