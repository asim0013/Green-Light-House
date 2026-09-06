// @vitest-environment node
//
// ⚠️ NOT jsdom, and this is load-bearing as of Story 3.7b — it took a confusing
// hour to find. The project default is jsdom (vitest.config.ts), which replaces
// the global `File` with JSDOM's. undici's multipart parser CONSTRUCTS parts
// using that global and then validates them with its own `webidl.is.File`
// brand check, which JSDOM's File fails — so `formData()` THROWS on any body
// containing a file part. The handler's own `catch` then answers 422
// `invalid_body`, so every attachment test failed with a plausible-looking
// validation error and nothing pointed at the environment. This file exercises
// a Node route handler; jsdom was never needed here.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanPdf, cleanXlsx, cleanDwg, plainZip } from "../../../../scripts/attachment-fixtures";

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
const burnLeadReference = vi.fn();
const listIndustries = vi.fn();
const getProductBySlug = vi.fn();
const listCategoryTree = vi.fn();
const queryProjectPrefill = vi.fn();
const checkRateLimit = vi.fn();
const scanBuffer = vi.fn();
const putObject = vi.fn();
const enqueueRfqSubmitted = vi.fn();

// Story 3.7b: BOTH must be mocked. vitest loads `.env` (vitest.setup.ts), so an
// unmocked clamav client would open a real socket to the developer's container
// and an unmocked putObject would write dozens of junk objects into the real
// MinIO bucket on every test run — the pollution the storage gate then reports.
vi.mock("@/lib/clamav", () => ({
  scanBuffer: (bytes: unknown, options?: unknown) => scanBuffer(bytes, options),
}));
vi.mock("@/lib/storage", () => ({
  putObject: (key: string, body: unknown, mime: string) => putObject(key, body, mime),
}));
// Story 3.3: the PRODUCER must be mocked for the same reason as the others —
// vitest loads `.env`, so an unmocked enqueue would reach the developer's real
// queue instance, and when that container is not running ioredis retries
// FOREVER by default, hanging the suite rather than failing it.
vi.mock("@/lib/queue", () => ({
  enqueueRfqSubmitted: (leadId: string) => enqueueRfqSubmitted(leadId),
}));

vi.mock("@/server/repositories/lead", () => ({
  createLead: (data: unknown) => createLead(data),
  burnLeadReference: () => burnLeadReference(),
}));
// The limiter is mocked default-ALLOW (Story 3.7a): this file issues dozens of
// POSTs — far past any single window — and vitest loads `.env`, so an unmocked
// limiter would both 429 the later tests AND mutate the developer's LIVE cache
// Redis. The key derivation stays REAL (importOriginal) — the client-identity
// tests below exercise it through the route.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: (options: unknown) => checkRateLimit(options) };
});
vi.mock("@/server/repositories/industry", () => ({
  listIndustries: (locale: string) => listIndustries(locale),
}));
vi.mock("@/server/repositories/product", () => ({
  getProductBySlug: (slug: string, locale: string) => getProductBySlug(slug, locale),
}));
// ⚠️ MOCKED SINCE THE 3.4 REVIEW, and it is not optional. The handler now
// re-runs the page's own resolution to derive `source`/`resolved`/`edited`, so
// an unmocked `queryProjectPrefill` would reach LIVE POSTGRES from a unit test —
// vitest loads `.env`, which is the same trap the queue and limiter mocks above
// exist to close.
vi.mock("@/server/repositories/project", () => ({
  queryProjectPrefill: (slug: string, locale: string) => queryProjectPrefill(slug, locale),
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

const CRLF = String.fromCharCode(13, 10);
const BOUNDARY = "glh37bboundary";

/**
 * A REAL multipart request (Story 3.7b), with the body assembled BY HAND.
 *
 * ⚠️ THE OBVIOUS VERSION DOES NOT WORK HERE, AND ITS FAILURE IS MISLEADING.
 * Under vitest's jsdom environment both `FormData` and `File` are JSDOM's, not
 * undici's. `form.set(name, jsdomFile)` fails undici's blob-like check and
 * coerces the value to the STRING "[object File]" — so every attachment test
 * 422s as `invalid` and the whole suite reads as a validator bug rather than a
 * harness one. Swapping in `node:buffer`'s Blob inverts the problem: JSDOM's
 * FormData then rejects IT as "not of type 'Blob'".
 *
 * Assembling the bytes here sidesteps both. The parser under test is still the
 * real one — the handler calls the platform's `formData()` on these bytes — and
 * the framing is now explicit enough to read, which matters for a suite whose
 * whole subject is what arrives on the wire.
 */
function multipartBody(payload: string, file?: { name: string; bytes: Uint8Array; type: string }) {
  const parts: Uint8Array[] = [];
  const text = (value: string) => parts.push(Buffer.from(value, "utf8"));

  text(`--${BOUNDARY}${CRLF}`);
  text(`Content-Disposition: form-data; name="payload"${CRLF}${CRLF}`);
  text(`${payload}${CRLF}`);

  if (file) {
    text(`--${BOUNDARY}${CRLF}`);
    text(
      `Content-Disposition: form-data; name="attachment"; filename="${file.name}"${CRLF}` +
        `Content-Type: ${file.type}${CRLF}${CRLF}`,
    );
    parts.push(file.bytes);
    text(CRLF);
  }

  text(`--${BOUNDARY}--${CRLF}`);
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

function postMultipart(
  payload: unknown,
  file?: { name: string; bytes: Uint8Array; type?: string },
  init: { headers?: Record<string, string>; origin?: string } = {},
) {
  const body = multipartBody(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    file && {
      ...file,
      // Deliberately a LIE by default: the handler must never consult the
      // client's Content-Type, for validation or for storage.
      type: file.type ?? "application/octet-stream",
    },
  );
  const headers = new Headers(init.headers);
  headers.set("content-type", `multipart/form-data; boundary=${BOUNDARY}`);
  if (init.origin) headers.set("origin", init.origin);
  return POST(
    new Request(`${SELF_ORIGIN}/api/rfq`, {
      method: "POST",
      headers,
      body: new Uint8Array(body),
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
  burnLeadReference.mockReset();
  listIndustries.mockReset();
  getProductBySlug.mockReset();
  listCategoryTree.mockReset();
  queryProjectPrefill.mockReset();
  checkRateLimit.mockReset();
  scanBuffer.mockReset();
  putObject.mockReset();
  enqueueRfqSubmitted.mockReset();
  enqueueRfqSubmitted.mockResolvedValue({ enqueued: true });
  scanBuffer.mockResolvedValue({ status: "clean" });
  putObject.mockResolvedValue(undefined);
  createLead.mockResolvedValue({ id: "lead-2042", reference: "GLH-RFQ-2042" });
  burnLeadReference.mockResolvedValue("GLH-RFQ-9001");
  listIndustries.mockResolvedValue([{ slug: "fire-safety" }, { slug: "oil-gas" }]);
  getProductBySlug.mockResolvedValue(null);
  listCategoryTree.mockResolvedValue([]);
  // Default: NOTHING resolves. Each attribution test opts in to the rows its
  // doorway needs, so a test that forgets to is a test whose slug named nothing
  // — which is now a meaningfully different outcome from one that resolved.
  queryProjectPrefill.mockResolvedValue(null);
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/rfq — guard chain", () => {
  it("415s an unaccepted content type BEFORE reading the body", async () => {
    // ⚠️ PLANNED INVERSION (Story 3.7b, AC14). This test used `multipart/
    // form-data` as its vehicle, which 3.7b now ACCEPTS. The vehicle changed;
    // the claim did not — the gate still refuses everything outside the two
    // accepted types, which is what keeps guard 1 a gate rather than a formality.
    const res = await post("field=value", { contentType: "text/plain" });
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe("unsupported_media_type");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("415s a made-up type that merely CONTAINS an accepted one", async () => {
    // `split(";")[0]` is an exact media-type match, not a substring test.
    for (const type of ["application/json-patch+json", "x-multipart/form-data"]) {
      const res = await post(VALID, { contentType: type });
      expect(res.status, type).toBe(415);
    }
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
      // Story 3.4: attribution is now IN the column map, but SERVER-DERIVED.
      // This payload carried no "prefill" object, so the doorway is "direct"
      // and the context is the same empty object a cold visit produces.
      source: "direct",
      prefillContext: { resolved: {}, cleared: false, edited: false },
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
      consentVersion: "privacy-2026-08-stub-r4:en",
    });
    // Server-stamped, never client time.
    expect((args.consentAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    // Labels resolved in the BUYER'S reply locale (what 3.3's emails cite).
    expect(getProductBySlug).toHaveBeenCalledWith("detector-x", "ru");
    expect(listCategoryTree).toHaveBeenCalledWith("ru");
  });

  it("minimal payload: optional columns are null, equipment [], reference absent, source direct", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(createLead.mock.calls[0][0]).toEqual({
      source: "direct",
      prefillContext: { resolved: {}, cleared: false, edited: false },
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
      consentVersion: "privacy-2026-08-stub-r4:en",
    });
  });

  it("a body smuggling source/reference/status/consentAt/attachments still writes the defaults", async () => {
    // `website` is EMPTY here deliberately (3.7a split this test): a filled
    // honeypot no longer writes at all — that path has its own describe below.
    // Empty-but-present proves the schema still STRIPS the travelling field.
    const res = await post({
      ...VALID,
      source: "project",
      reference: "GLH-RFQ-9999",
      status: "quoted",
      consentAt: "1999-01-01T00:00:00.000Z",
      consentVersion: "forged",
      attachmentKey: "evil",
      website: "",
    });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    // ⚠️ THE ASSERTION MOVED, AND IT GOT STRONGER (Story 3.4). `source` and
    // `prefillContext` are now written — so "absent" is no longer the property
    // that proves a client cannot forge attribution. THIS is: the body claimed
    // `source: "project"`, and what reaches the column is the SERVER'S verdict,
    // `direct`, because this payload carried no `prefill` params to resolve
    // from. A handler that trusted the body would write "project" here.
    expect(args.source).toBe("direct");
    expect(args.prefillContext).toEqual({ resolved: {}, cleared: false, edited: false });
    expect(args).not.toHaveProperty("reference");
    expect(args).not.toHaveProperty("status");
    expect(args).not.toHaveProperty("attachmentKey");
    expect(args).not.toHaveProperty("website");
    expect(args.consentVersion).toBe("privacy-2026-08-stub-r4:en");
    expect((args.consentAt as Date).getFullYear()).toBeGreaterThan(2000);
  });

  it("consentVersion carries the ACTUAL uiLocale — a hard-coded ':en' cannot pass (3.2 review)", async () => {
    const res = await post({ ...VALID, uiLocale: "ru" });
    expect(res.status).toBe(201);
    expect(createLead.mock.calls[0][0].consentVersion).toBe("privacy-2026-08-stub-r4:ru");
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

describe("POST /api/rfq — the rate limiter seam (Story 3.7a)", () => {
  it("limited → 429 with the envelope code, Retry-After from the TTL, and NO write", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 1234 });
    const res = await post(VALID);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
    expect((await errorOf(res)).code).toBe("rate_limited");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("counts BEFORE the body is PARSED: a limited client gets 429 even for malformed JSON", async () => {
    // If the limiter ran after the parse, this would be a 422 — the ordering
    // is epics:934's "before the request body is parsed", pinned.
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const res = await post("{not json");
    expect(res.status).toBe(429);
  });

  it("counts BEFORE the body is READ: a limited client gets 429, not 413, on an oversize body", async () => {
    // The parse test above cannot see this half — a small malformed body
    // passes readBodyCapped unharmed, so relocating guard 2.5 BELOW guard 3
    // kept every assertion green while breaking the documented order (3.7a
    // review). An oversize declaration is 413 only if the size guard ran
    // first, so 429 here is the ordering proof.
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const res = await post(VALID, { headers: { "content-length": String(65 * 1024) } });
    expect(res.status).toBe(429);
  });

  it("SEAM POSITION: 415 and 403 rejections never consume budget — the limiter is not invoked", async () => {
    // Load-bearing for every POST-budget in both suites and for the abuse
    // economics; goes red if the guard order is ever shuffled.
    await post("junk", { contentType: "text/plain" });
    expect(checkRateLimit).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await post(VALID, { origin: "https://evil.example" });
    expect(checkRateLimit).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("calls the limiter with the FR32 numbers and the policy-derived client key", async () => {
    await post(VALID, { headers: { "x-forwarded-for": "6.6.6.6, spoofed, 203.0.113.77" } });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        keyspace: "rfq:rl:",
        client: "203.0.113.77",
        limit: 5,
        windowSeconds: 3600,
        label: "rfq-rl",
      }),
    );
  });

  it("no x-forwarded-for (hand-built Request) → the shared 'unknown' bucket", async () => {
    await post(VALID);
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ client: "unknown" }));
  });
});

describe("POST /api/rfq — the honeypot (Story 3.7a, Task 0 #1: silent drop + recovery log)", () => {
  it("filled honeypot + VALID body → fake 201 from a burned nextval, NO row, the recovery log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post({ ...VALID, website: "https://spam.example" });
    expect(res.status).toBe(201);
    // The burned-sequence fake, byte-identical in shape to a real success.
    expect(await res.json()).toEqual({ reference: "GLH-RFQ-9001" });
    expect(burnLeadReference).toHaveBeenCalledTimes(1);
    expect(createLead).not.toHaveBeenCalled();
    // The recovery line: the fabricated reference (reconcilable when quoted),
    // the value's LENGTH only — never the value, never PII.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("honeypot_filled ref=GLH-RFQ-9001 len=20"),
    );
    const logged = (warn.mock.calls[0]?.[0] as string) ?? "";
    expect(logged).not.toContain("spam.example");
    expect(logged).not.toContain(VALID.email);
    warn.mockRestore();
  });

  it("filled honeypot + INVALID body → the SAME 422 as anyone (full chain runs first)", async () => {
    const res = await post({ ...VALID, consent: false, website: "https://spam.example" });
    expect(res.status).toBe(422);
    expect(burnLeadReference).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
  });

  it("whitespace-only website is a CLEAN path — the trap fires on substance, not spaces", async () => {
    const res = await post({ ...VALID, website: "   " });
    expect(res.status).toBe(201);
    expect(createLead).toHaveBeenCalledTimes(1);
    expect(burnLeadReference).not.toHaveBeenCalled();
  });

  it("burn failure (Postgres down) mirrors the real path's 500 exactly", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    burnLeadReference.mockRejectedValue(new Error("connection refused"));
    const res = await post({ ...VALID, website: "x" });
    expect(res.status).toBe(500);
    expect((await errorOf(res)).code).toBe("internal_error");
    consoleError.mockRestore();
  });
});

describe("POST /api/rfq — multipart intake (Story 3.7b, AC1/AC2)", () => {
  it("accepts multipart and writes the lead — the branch the 415 test no longer covers", async () => {
    const res = await postMultipart(VALID);
    expect(res.status).toBe(201);
    expect(createLead).toHaveBeenCalledTimes(1);
  });

  it("a multipart submission WITHOUT a file writes no attachment columns at all", async () => {
    // `attachment_scan_status = null` means NO ATTACHMENT, never "unscanned"
    // (schema.prisma:65-67). Absent keys, not null keys — the same distinction
    // the create-args centrepiece makes for `source` and `reference`.
    await postMultipart(VALID);
    const args = createLead.mock.calls[0][0];
    for (const column of [
      "attachmentKey",
      "attachmentName",
      "attachmentMime",
      "attachmentSizeBytes",
      "attachmentScanStatus",
      "attachmentScannedAt",
    ]) {
      expect(args, column).not.toHaveProperty(column);
    }
    expect(scanBuffer).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("the JSON branch KEEPS its 64 KB cap — a JSON POST declaring 15 MB still 413s", async () => {
    // The regression this guards: widening one constant for both branches would
    // have handed every JSON body a 15 MB allowance, silently, with no test red.
    const res = await post(VALID, { headers: { "content-length": String(15 * 1024 * 1024) } });
    expect(res.status).toBe(413);
  });

  it("the multipart ceiling is HIGHER than the JSON one — the same declaration passes", async () => {
    // The other half of branch isolation: if both branches shared the 64 KB
    // limit, every real attachment would 413 and the test above would still be
    // green. One assertion cannot prove a split; two can.
    const res = await postMultipart(VALID, undefined, {
      headers: { "content-length": String(15 * 1024 * 1024) },
    });
    expect(res.status).toBe(201);
  });

  it("413s a multipart body whose declared length exceeds the multipart ceiling", async () => {
    const res = await postMultipart(VALID, undefined, {
      headers: { "content-length": String(64 * 1024 * 1024) },
    });
    expect(res.status).toBe(413);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("422s malformed multipart framing as invalid_body, never a 500", async () => {
    const crlf = String.fromCharCode(13) + String.fromCharCode(10);
    const res = await POST(
      new Request(`${SELF_ORIGIN}/api/rfq`, {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=zzz" },
        body: ["--zzz", "this is not a valid part", ""].join(crlf),
      }),
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("invalid_body");
  });

  it("422s a multipart body with no `payload` part", async () => {
    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}${CRLF}`, "utf8"),
      Buffer.from(
        `Content-Disposition: form-data; name="attachment"; filename="spec.pdf"${CRLF}${CRLF}`,
        "utf8",
      ),
      cleanPdf(),
      Buffer.from(`${CRLF}--${BOUNDARY}--${CRLF}`, "utf8"),
    ]);
    const res = await POST(
      new Request(`${SELF_ORIGIN}/api/rfq`, {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
        body: new Uint8Array(body),
      }),
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("invalid_body");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("413s an oversize `payload` part even inside a legal-sized multipart body", async () => {
    // The payload part carries the JSON branch own ceiling, so multipart is not
    // a way to smuggle a 15 MB JSON document past the 64 KB rule.
    const res = await postMultipart({ ...VALID, projectDetails: "x".repeat(70 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe("POST /api/rfq — attachment validation (Story 3.7b, AC3)", () => {
  const rejections: [string, string, Uint8Array, string][] = [
    ["an unaccepted extension", "macro.docx", cleanXlsx(), "fileType"],
    ["bytes contradicting the name", "spec.pdf", cleanXlsx(), "fileCorrupt"],
    ["a real ZIP disguised as a workbook", "boq.xlsx", plainZip(), "fileCorrupt"],
    ["an empty file", "spec.pdf", new Uint8Array(0), "fileCorrupt"],
  ];

  it.each(rejections)("422s %s with its OWN key", async (_label, name, bytes, key) => {
    const res = await postMultipart(VALID, { name, bytes });
    expect(res.status).toBe(422);
    const error = await errorOf(res);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toContainEqual({ path: "attachment", key });
    expect(createLead).not.toHaveBeenCalled();
    // Nothing was scanned and nothing was stored: intake rejects before either.
    expect(scanBuffer).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("an attachment just over the FILE limit gets `fileTooLarge`, and is never scanned", async () => {
    // The two ceilings are deliberately different, and the gap between them is
    // what makes this key reachable at all: the BODY ceiling is the file limit
    // plus the payload limit plus framing, so a 15 MB + 1 attachment slips past
    // the stream guard and is caught by the file rule — which is the better
    // outcome, because 413 names no cause and this names one.
    const oversize = new Uint8Array(15 * 1024 * 1024 + 1);
    oversize.set(cleanPdf());
    const res = await postMultipart(VALID, { name: "huge.pdf", bytes: oversize });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toContainEqual({
      path: "attachment",
      key: "fileTooLarge",
    });
    // Nothing that large is ever handed to clamd or to the bucket.
    expect(scanBuffer).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
  });

  it("an attachment past the BODY ceiling dies on the stream, before parsing", async () => {
    // The other side of the gap: far enough over and the byte counter cancels
    // the read mid-stream, so nothing is buffered, parsed or validated. This is
    // AC2's "aborted at the ceiling" half, and it uses NO content-length header
    // so it cannot be satisfied by the declaration short-circuit.
    const huge = new Uint8Array(16 * 1024 * 1024);
    huge.set(cleanPdf());
    const res = await postMultipart(VALID, { name: "huge.pdf", bytes: huge });
    expect(res.status).toBe(413);
    expect(scanBuffer).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
  });

  it("reports FIELD errors and the ATTACHMENT error in one response", async () => {
    // A buyer with a missing name and a wrong file hears about both at once,
    // rather than fixing one and being told about the other on the next round.
    const res = await postMultipart({ ...VALID, name: "" }, { name: "x.exe", bytes: cleanPdf() });
    expect(res.status).toBe(422);
    const details = (await errorOf(res)).details!;
    expect(details).toContainEqual({ path: "name", key: "required" });
    expect(details).toContainEqual({ path: "attachment", key: "fileType" });
  });

  it("refuses a filename this stack cannot store — the 500-at-the-insert class", async () => {
    // Built by char code: writing control characters as escapes in source is
    // what has repeatedly planted RAW control bytes in this repository.
    const res = await postMultipart(VALID, {
      name: `spec${String.fromCharCode(0)}.pdf`,
      bytes: cleanPdf(),
    });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toContainEqual({ path: "attachment", key: "invalid" });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("an `attachment` sent as a TEXT field is malformed, not empty", async () => {
    const form = new FormData();
    form.set("payload", JSON.stringify(VALID));
    form.set("attachment", "../../etc/passwd");
    const res = await POST(new Request(`${SELF_ORIGIN}/api/rfq`, { method: "POST", body: form }));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toContainEqual({ path: "attachment", key: "invalid" });
  });
});

describe("POST /api/rfq — the scan gate (Story 3.7b, AC4/AC5)", () => {
  it("INFECTED → 422 scanFailed, NO upload, NO row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    scanBuffer.mockResolvedValue({ status: "infected", signature: "Eicar-Signature" });
    const res = await postMultipart(VALID, { name: "spec.pdf", bytes: cleanPdf() });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toContainEqual({ path: "attachment", key: "scanFailed" });
    // The file never reaches the bucket — that is what makes FR32a "scanned
    // before storage" literally true rather than approximately true.
    expect(putObject).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
    // The signature is logged for US and withheld from the sender.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Eicar-Signature"));
    warn.mockRestore();
  });

  it("SCANNER DOWN → the same 422 and the same key, never a stored unscanned file", async () => {
    // Fail-closed on the attachment, and ONLY on the attachment: a submission
    // without a file is untouched by a clamd outage (proven by the no-file test
    // above, which never calls the scanner at all).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    scanBuffer.mockResolvedValue({ status: "failed", reason: "unreachable" });
    const res = await postMultipart(VALID, { name: "spec.pdf", bytes: cleanPdf() });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details).toContainEqual({ path: "attachment", key: "scanFailed" });
    expect(putObject).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("infected and scanner-down are INDISTINGUISHABLE to the sender", async () => {
    // Deliberate (Task 0 #12): a distinct key would turn this endpoint into a
    // free malware-detection oracle. Compared as whole response bodies, so a
    // future divergence anywhere in the envelope goes red.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    scanBuffer.mockResolvedValue({ status: "infected", signature: "Win.Test.EICAR_HDB-1" });
    const infected = await (
      await postMultipart(VALID, { name: "a.pdf", bytes: cleanPdf() })
    ).json();
    scanBuffer.mockResolvedValue({ status: "failed", reason: "timeout" });
    const down = await (await postMultipart(VALID, { name: "a.pdf", bytes: cleanPdf() })).json();
    expect(infected).toEqual(down);
    warn.mockRestore();
  });

  it("the scanner receives the FILE bytes, not the request body", async () => {
    const bytes = cleanPdf();
    await postMultipart(VALID, { name: "spec.pdf", bytes });
    expect(scanBuffer).toHaveBeenCalledTimes(1);
    const scanned = scanBuffer.mock.calls[0][0] as Uint8Array;
    expect(Buffer.from(scanned).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe("POST /api/rfq — the attachment write path (Story 3.7b, AC5)", () => {
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  it("CLEAN → quarantine upload + ONE insert carrying all six columns", async () => {
    const bytes = cleanXlsx();
    const before = Date.now();
    const res = await postMultipart(VALID, {
      name: "bill-of-quantities.xlsx",
      // The browser Content-Type is a lie on purpose; the stored mime must come
      // from the format table instead.
      type: "text/plain",
      bytes,
    });
    expect(res.status).toBe(201);

    const [key, body, mime] = putObject.mock.calls[0];
    expect(key).toMatch(/^quarantine\/[0-9a-f-]{36}\.xlsx$/);
    expect(Buffer.from(body as Uint8Array).equals(Buffer.from(bytes))).toBe(true);
    expect(mime).toBe(XLSX_MIME);
    // The buyer filename is stored, and is NOT in the key.
    expect(key).not.toContain("bill-of-quantities");

    expect(createLead).toHaveBeenCalledTimes(1);
    const args = createLead.mock.calls[0][0];
    expect(args.attachmentKey).toBe(key);
    expect(args.attachmentName).toBe("bill-of-quantities.xlsx");
    expect(args.attachmentMime).toBe(XLSX_MIME);
    expect(args.attachmentSizeBytes).toBe(bytes.length);
    expect(args.attachmentScanStatus).toBe("clean");
    expect((args.attachmentScannedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("the ORDER is scan → upload → insert, never upload → scan", async () => {
    // Pinned as an ordering, not inferred from outcomes: swapping the two would
    // store an infected file and then delete it, which is a different (and
    // worse) design that the infected test alone would not catch.
    const order: string[] = [];
    scanBuffer.mockImplementation(async () => {
      order.push("scan");
      return { status: "clean" };
    });
    putObject.mockImplementation(async () => {
      order.push("upload");
    });
    createLead.mockImplementation(async () => {
      order.push("insert");
      return { id: "lead-2042", reference: "GLH-RFQ-2042" };
    });
    await postMultipart(VALID, { name: "spec.pdf", bytes: cleanPdf() });
    expect(order).toEqual(["scan", "upload", "insert"]);
  });

  it("UPLOAD FAILURE after a clean scan → `failed`, NO key, and the lead is KEPT", async () => {
    // Persist-first (FR29): an attachment must never cost an inquiry. The row
    // honestly records that a file was sent, scanned, and could not be kept.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    putObject.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));
    const res = await postMultipart(VALID, { name: "spec.pdf", bytes: cleanPdf() });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.attachmentScanStatus).toBe("failed");
    expect(args.attachmentKey).toBeNull();
    // The metadata survives, so Story 4.7 can say WHICH file was lost.
    expect(args.attachmentName).toBe("spec.pdf");
    expect(args.attachmentSizeBytes).toBe(cleanPdf().length);
    error.mockRestore();
  });

  it("smuggled attachment columns lose to the SERVER-derived values", async () => {
    // AC14: the pre-3.7b version of this claim only proved the columns were
    // ABSENT, which stopped being the interesting case the moment they became
    // writable. Now they ARE written — so the claim is that what gets written
    // is ours, not theirs.
    const res = await postMultipart(
      {
        ...VALID,
        attachmentKey: "docs/fd-9500-datasheet-v1.pdf",
        attachmentName: "innocent.pdf",
        attachmentMime: "text/html",
        attachmentSizeBytes: 1,
        attachmentScanStatus: "clean",
        attachmentScannedAt: "1999-01-01T00:00:00.000Z",
      },
      { name: "real.dwg", bytes: cleanDwg() },
    );
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.attachmentKey).toMatch(/^quarantine\//);
    expect(args.attachmentName).toBe("real.dwg");
    expect(args.attachmentMime).toBe("image/vnd.dwg");
    expect(args.attachmentSizeBytes).toBe(cleanDwg().length);
    expect((args.attachmentScannedAt as Date).getFullYear()).toBeGreaterThan(2000);
  });

  it("HONEYPOT + attachment → fake 201, nothing stored, no row", async () => {
    // The honeypot still diverges only at the PERSIST step (3.7a contract), so
    // a trapped bot file IS scanned — indistinguishability is the point — but
    // it is never uploaded and no row is written, which is what makes this path
    // orphan-free by construction (Task 0 #7).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await postMultipart(
      { ...VALID, website: "https://spam.example" },
      { name: "spec.pdf", bytes: cleanPdf() },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ reference: "GLH-RFQ-9001" });
    expect(scanBuffer).toHaveBeenCalledTimes(1);
    expect(putObject).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("POST /api/rfq — the enqueue seam (Story 3.3, AC1/AC2)", () => {
  it("enqueues ONCE with the lead id after a successful insert", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(enqueueRfqSubmitted).toHaveBeenCalledTimes(1);
    // The ID, not the reference: the worker re-reads the row by primary key.
    expect(enqueueRfqSubmitted).toHaveBeenCalledWith("lead-2042");
  });

  it("the 201 body carries the reference ONLY — never the id", async () => {
    // The honeypot counterfeits this exact shape (Story 3.7a). Leaking the id
    // would make a real success distinguishable from a fabricated one, which is
    // the whole property the trap depends on.
    const res = await post(VALID);
    expect(await res.json()).toEqual({ reference: "GLH-RFQ-2042" });
  });

  it("the ORDER is insert → enqueue: no job can reference a lead that does not exist", async () => {
    const order: string[] = [];
    createLead.mockImplementation(async () => {
      order.push("insert");
      return { id: "lead-2042", reference: "GLH-RFQ-2042" };
    });
    enqueueRfqSubmitted.mockImplementation(async () => {
      order.push("enqueue");
      return { enqueued: true };
    });
    await post(VALID);
    expect(order).toEqual(["insert", "enqueue"]);
  });

  it("A FAILED ENQUEUE STILL ANSWERS 201 — the lead is already committed", async () => {
    // FR29's whole point. `enqueueRfqSubmitted` never throws by contract, but a
    // future edit could make the route treat `{enqueued:false}` as fatal; this
    // pins that it must not.
    enqueueRfqSubmitted.mockResolvedValue({ enqueued: false });
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ reference: "GLH-RFQ-2042" });
  });

  it("even a THROWING producer cannot cost the buyer their submission", async () => {
    // Defence in depth against the contract being broken upstream: if the
    // producer ever regressed to throwing, the route must still answer 201
    // rather than turning a committed lead into a 500 the buyer retries.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    enqueueRfqSubmitted.mockRejectedValue(new Error("ECONNREFUSED 6380"));
    const res = await post(VALID);
    expect(res.status).toBe(201);
    error.mockRestore();
  });

  it("the HONEYPOT path never enqueues — it writes no row and has no id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post({ ...VALID, website: "https://spam.example" });
    expect(res.status).toBe(201);
    expect(createLead).not.toHaveBeenCalled();
    // A job here would make the worker try to email a lead that does not exist,
    // and would give a bot a way to make us send mail.
    expect(enqueueRfqSubmitted).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("the INSERT-FAILURE path never enqueues", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    createLead.mockRejectedValue(new Error("connection refused"));
    const res = await post(VALID);
    expect(res.status).toBe(500);
    expect(enqueueRfqSubmitted).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("every pre-insert rejection is enqueue-free", async () => {
    // One assertion covering the whole guard chain: if a future edit hoisted
    // the enqueue above the insert, these all start minting jobs for leads that
    // were never written.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await post("junk", { contentType: "text/plain" }); // 415
    await post(VALID, { origin: "https://evil.example" }); // 403
    await post("{not json"); // 422
    await post({ ...VALID, consent: false }); // 422
    expect(enqueueRfqSubmitted).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("attribution is SERVER-DERIVED, never client-reported (Story 3.4, AC9)", () => {
  it("resolves source and prefillContext from the params the client echoes back", async () => {
    // The buyer KEEPS what the doorway pre-selected, so the industry rides back
    // in the payload. (Dropping it is the `edited` case, proven separately
    // below — `VALID` alone carries no industry, so omitting it here would
    // silently assert the wrong branch.)
    // The doorway must RESOLVE for its slug to be recorded — the handler re-runs
    // the page's own reads since the 3.4 review.
    queryProjectPrefill.mockResolvedValue({
      industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
      categories: [],
    });
    const res = await post({
      ...VALID,
      industry: "oil-gas",
      prefill: { project: "lng-terminal-fire-gas-upgrade", industry: "oil-gas", cleared: false },
    });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    // Precedence: project beats industry, so a lead that came through a project
    // doorway is a project lead even though the URL also carried its industry.
    expect(args.source).toBe("project");
    expect(args.prefillContext).toEqual({
      resolved: { project: "lng-terminal-fire-gas-upgrade", industry: "oil-gas" },
      cleared: false,
      edited: false,
    });
  });

  it("a search doorway is `search`, and the query rides in the context, not in `resolved`", async () => {
    const res = await post({ ...VALID, projectDetails: "fd9500x", prefill: { q: "fd9500x" } });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.source).toBe("search");
    expect(args.prefillContext).toMatchObject({ query: "fd9500x", resolved: {} });
  });

  it("a CATEGORY-only doorway is `direct` — category is equipment context, not an origin", async () => {
    listCategoryTree.mockResolvedValue([
      { slug: "flame-detectors", name: "Flame detectors", isFallback: false, children: [] },
    ]);
    const res = await post({ ...VALID, prefill: { category: "flame-detectors" } });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.source).toBe("direct");
    // …and the value is still preserved, so the lead stays distinguishable
    // from cold traffic.
    expect(args.prefillContext).toMatchObject({ resolved: { category: "flame-detectors" } });
  });

  it("a FABRICATED slug resolves to nothing and is NOT recorded as an origin", async () => {
    /**
     * ⚠️ THE 3.4 REVIEW'S HEADLINE FINDING, and the proof it is closed. `source`
     * used to be derived from the client's params ALONE, with no lookup of any
     * kind — so a body naming any well-formed slug had it written straight into
     * `Lead.source` and `prefillContext.resolved`, from a client that never
     * loaded `/rfq`. `zzq-marker-7f3` is the marker the doorway e2e already
     * uses: a VALID slug matching no row.
     *
     * P5: drop the `resolveRfqPrefill` call and pass `prefillParams` directly to
     * `resolvePrefillSource`/`buildPrefillContext` — this reddens immediately,
     * because the fabricated slug is recorded as a project origin again.
     *
     * ⚠️ WHAT THIS DOES NOT PROVE: that attribution is unforgeable. A client can
     * still submit a REAL slug it never visited. See the handler's comment —
     * `Lead.source` is an analytics signal, not an authenticated fact.
     */
    queryProjectPrefill.mockResolvedValue(null);
    const res = await post({ ...VALID, prefill: { project: "zzq-marker-7f3" } });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.source).toBe("direct");
    expect(args.prefillContext).toMatchObject({ resolved: {} });
  });

  it("`edited` is TRUE when a project-doorway buyer changes the industry it seeded", async () => {
    /**
     * ⚠️ STRUCTURALLY IMPOSSIBLE BEFORE THE 3.4 REVIEW, which is what made this
     * worth writing. `wasPrefillEdited` compared `params.industry` — a param a
     * `?project=` doorway NEVER supplies, because the industry is derived by
     * resolving the project. So every project lead recorded `edited: false`
     * whatever the buyer did, and Story 4.7 would report it as untouched.
     *
     * P5: compare against `params` instead of the resolved model — reddens.
     */
    queryProjectPrefill.mockResolvedValue({
      industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
      categories: [],
    });
    const res = await post({
      ...VALID,
      industry: "fire-safety", // the buyer picked a different sector
      prefill: { project: "lng-terminal-fire-gas-upgrade", cleared: false },
    });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.source).toBe("project");
    expect(args.prefillContext).toMatchObject({ edited: true });
  });

  it("`edited` is TRUE when the buyer removes a chip the doorway seeded", async () => {
    // The other half of `edited` for doorways that seed ONLY equipment
    // (`?product=`, `?category=`): removal is an edit, while chips the buyer
    // ADDS are not — which is why the payload here still carries a freeText one.
    getProductBySlug.mockResolvedValue({
      slug: "fd-9500",
      name: "Flame Detector X1",
      isFallback: false,
      category: { slug: "flame-detectors", name: "Flame detectors", isFallback: false },
    });
    const res = await post({
      ...VALID,
      equipment: [{ kind: "freeText", text: "2 control panels" }],
      prefill: { product: "fd-9500" },
    });
    expect(res.status).toBe(201);
    const args = createLead.mock.calls[0][0];
    expect(args.source).toBe("product");
    expect(args.prefillContext).toMatchObject({ edited: true });
  });

  it("records `cleared` — the one thing only the client can know", async () => {
    const res = await post({ ...VALID, prefill: { industry: "oil-gas", cleared: true } });
    expect(res.status).toBe(201);
    expect(createLead.mock.calls[0][0].prefillContext).toMatchObject({ cleared: true });
  });

  it("DERIVES `edited` rather than trusting it — a dropped industry is an edit", async () => {
    // The doorway supplied `oil-gas`; the payload arrives without it, so the
    // buyer changed the select. Nothing in the body says so.
    const res = await post({ ...VALID, industry: undefined, prefill: { industry: "oil-gas" } });
    expect(res.status).toBe(201);
    expect(createLead.mock.calls[0][0].prefillContext).toMatchObject({ edited: true });
  });

  it("REFUSES a prefill slug that is not slug-shaped — 422, never a JSONB write", async () => {
    const res = await post({ ...VALID, prefill: { project: "Oil Gas/../x" } });
    expect(res.status).toBe(422);
    expect(createLead).not.toHaveBeenCalled();
  });
});
