import type { Locale, Prisma } from "@prisma/client";
import { siteOrigin } from "@/lib/seo";
import {
  rfqSchema,
  issueDetails,
  PRIVACY_POLICY_VERSION,
  type RfqInput,
} from "@/server/rfq/schema";
import type { LeadEquipmentItem } from "@/server/rfq/contracts";
import { createLead, type LeadCreateData } from "@/server/repositories/lead";
import { listIndustries } from "@/server/repositories/industry";
import { getProductBySlug } from "@/server/repositories/product";
import { listCategoryTree, type CategoryTreeNode } from "@/server/repositories/category";

/**
 * `POST /api/rfq` — the app's first unauthenticated write endpoint (Story 3.2,
 * AC3/AC4). Persist-first: success IS the Prisma commit. The handler imports NO
 * Redis client — only Postgres-down loses a lead, and that path writes nothing.
 *
 * EVERYTHING PROTECTIVE LIVES IN THIS HANDLER. `src/proxy.ts` provably excludes
 * `/api`, so middleware placement fails open with no log (architecture:213) —
 * never move a guard there. The chain, in order:
 *
 *   1. strict `application/json` gate → 415. The FIRST cross-site defence:
 *      a cross-origin JSON POST requires a CORS preflight, and this route never
 *      grants one (no CORS headers anywhere here — that absence is load-bearing).
 *   2. Origin check (architecture:68) → 403. Present-and-mismatched is rejected
 *      and logged; ABSENT is allowed (curl, server-to-server, the e2e's direct
 *      POSTs carry no Origin). CANONICAL-origin comparison, never raw strings
 *      (3.2 review): browsers send the Origin header lowercased and without
 *      default ports, so a raw compare against a legal SITE_URL spelling
 *      ("https://GLH.example", ":443") would 403 every real buyer — a silent,
 *      total funnel outage. DISCLOSED AC3 DEVIATION: AC3 says "does not match
 *      the request host", but this compares against `siteOrigin()` (SITE_URL),
 *      deliberately — trusting the request's Host/X-Forwarded-Host is exactly
 *      the trusted-proxy policy Story 3.7a owns, and half-implementing it here
 *      would let a spoofed Host defeat the check. A deployment whose serving
 *      origin differs from SITE_URL rejects browser POSTs; SITE_URL being
 *      right is already load-bearing for every canonical/hreflang on the site.
 *   3. self-imposed 64 KB body cap → 413. Route handlers have NO built-in limit
 *      (`bodySizeLimit` is Server-Actions-only): Content-Length is checked
 *      first, then the stream is read with a byte counter because chunked
 *      transfer has no Content-Length and the header can lie.
 *   4. JSON parse → 422 `invalid_body` (the revalidate precedent — this repo
 *      maps malformed bodies to 422, not 400).
 *   5. shared zod schema → 422 `validation_failed` with `{ path, key }` details.
 *      Consent is `z.literal(true)` INSIDE the schema, so a `consent: false`
 *      POST dies here — the create below is unreachable without it.
 *
 * ── STORY 3.7a SEAM ──────────────────────────────────────────────────────────
 * The rate limiter and the honeypot check land BETWEEN guards 2 and 5:
 *   - the limiter runs BEFORE the body is read (guard 3) — a self-contained
 *     early-return whose counters live on the CACHE Redis (`rfq:rl:*`,
 *     REDIS_URL, never the durable queue instance) and whose Redis failure
 *     must fail OPEN without ever reaching the persist path;
 *   - the honeypot check reads the `website` field off the parsed body (the
 *     shared zod schema STRIPS it, so read it from the raw parse, after guard
 *     4). A honeypot hit returns THIS route's exact success shape —
 *     `{ reference }`, 201 — with NO row written; 3.7a owns the fabrication
 *     strategy for that fake reference. ⚠️ TREAT A FILLED HONEYPOT AS A SOFT
 *     SIGNAL, not an unconditional silent drop (3.2 review): Chrome ignores
 *     `autocomplete="off"`, and profile-autofill on a form whose real fields
 *     carry name/organization/email/tel tokens can populate a labeled
 *     "Website" input for a REAL buyer — a silent drop would eat their lead.
 * Neither exists in 3.2: no limiter, no counter, no 429, by the sprint
 * proposal's split (3.7a is merge-gated to this story on the same branch).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * After validation, the handler resolves against the DB: `industry` must be a
 * real PID slug (`listIndustries` — AC2), and `product`/`category` equipment
 * labels are re-resolved to display names at submit time where resolvable (AC4
 * snapshot semantics; the buyer-typed label survives only when the slug no
 * longer resolves). In 3.2 the form itself only emits `freeText` items — the
 * catalog kinds arrive with Story 3.4's pre-fill — but a direct POST may send
 * them today, so the endpoint handles them today.
 *
 * HONEST COST ACCOUNTING (3.2 review — an earlier draft claimed "not
 * attacker-amplified", which was wrong): per-REQUEST cost is bounded (≤20
 * validated items, catalog slugs deduplicated before resolution so one slug
 * costs one lookup) but request RATE is not, until 3.7a's limiter merges.
 * Unknown-but-valid-shaped product slugs each mint a cached-null id-hop entry
 * (the 2.2 slug-gate bounds shape, never cardinality) — the limiter is what
 * bounds the minting rate.
 */

/** AC3's self-imposed cap. Attachments are 3.7b's and arrive multipart — 415'd. */
const BODY_LIMIT_BYTES = 64 * 1024;

/** Architecture § Format — errors are `{ error: { code, message, details? } }`. */
function fail(
  status: number,
  code: string,
  message: string,
  details?: { path: string; key: string }[],
): Response {
  return Response.json(
    { error: details ? { code, message, details } : { code, message } },
    { status },
  );
}

/**
 * Read the body with a byte counter, or return null past the cap. The
 * Content-Length short-circuit avoids reading a declared-oversize body at all;
 * the counter is the defence when the header is absent or lying.
 */
async function readBodyCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT_BYTES) return null;

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function findCategory(nodes: readonly CategoryTreeNode[], slug: string): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const child = findCategory(node.children, slug);
    if (child) return child;
  }
  return null;
}

/**
 * AC4's snapshot semantics: `label` is the server-resolved display name at
 * submit time for catalog kinds, resolved in the BUYER'S reply locale — the
 * label is "what this item is called to this buyer", and Story 3.3's emails cite
 * it back to them. Items are rebuilt field-by-field, never spread, so nothing
 * beyond the contract's shape can reach the JSONB column.
 */
async function resolveEquipment(
  items: RfqInput["equipment"],
  locale: Locale,
): Promise<LeadEquipmentItem[]> {
  const categoryTree = items.some((item) => item.kind === "category")
    ? await listCategoryTree(locale)
    : [];

  // DISTINCT product slugs resolve once (3.2 review): 20 copies of one
  // attacker-chosen slug must cost one lookup, not 20 parallel query pairs.
  const productSlugs = [...new Set(items.filter((i) => i.kind === "product").map((i) => i.slug))];
  const productNames = new Map<string, string | null>(
    await Promise.all(
      productSlugs.map(async (slug): Promise<[string, string | null]> => {
        const product = await getProductBySlug(slug, locale);
        return [slug, product?.name ?? null];
      }),
    ),
  );

  return items.map((item): LeadEquipmentItem => {
    if (item.kind === "freeText") return { kind: "freeText", text: item.text };
    if (item.kind === "product") {
      return { kind: "product", slug: item.slug, label: productNames.get(item.slug) ?? item.label };
    }
    const category = findCategory(categoryTree, item.slug);
    return { kind: "category", slug: item.slug, label: category?.name ?? item.label };
  });
}

/**
 * Canonical-origin equality (3.2 review): both sides pass through
 * `new URL(...).origin`, so case, default ports and any trailing path in
 * SITE_URL cannot 403 a legitimate browser. An unparseable Origin — including
 * the literal `"null"` an opaque context sends — fails closed.
 */
function originAllowed(origin: string): boolean {
  try {
    return new URL(origin).origin === new URL(siteOrigin()).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Guard 1 — media type, not string equality (`;charset=utf-8` is legal).
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return fail(415, "unsupported_media_type", "Only application/json bodies are accepted.");
  }

  // Guard 2 — Origin: present-and-mismatched → reject + log; absent → allow.
  const origin = request.headers.get("origin");
  if (origin !== null && !originAllowed(origin)) {
    // Truncated: the header is attacker-controlled and unbounded.
    console.warn(`[rfq] cross-origin POST rejected (origin ${origin.slice(0, 200)})`);
    return fail(403, "invalid_origin", "Cross-origin submissions are not accepted.");
  }

  // ── 3.7a seam: the rate limiter's early return belongs HERE, before the body
  // is read. See the module docstring for the whole inherited contract. ──

  // Guard 3 — size.
  const body = await readBodyCapped(request);
  if (body === null) {
    return fail(413, "payload_too_large", "Request body exceeds the 64 KB limit.");
  }

  // Guard 4 — parse. Malformed JSON → 422 `invalid_body` (revalidate precedent).
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(422, "invalid_body", "Request body is not valid JSON.");
  }

  // A valid-JSON non-object (`[]`, `null`, `"x"`) must die HERE: handing it to
  // zod would leak the library's English "expected object" sentence where the
  // envelope promises stable keys (3.2 review).
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return fail(422, "invalid_body", "Request body must be a JSON object.");
  }

  // ── 3.7a seam: the honeypot check reads `website` off `json` HERE — after the
  // parse, before validation strips it. ──

  // Guard 5 — the shared schema. Consent (`z.literal(true)`) fails here, so
  // every rejection path above and including this one is provably row-free.
  const parsed = rfqSchema.safeParse(json);
  if (!parsed.success) {
    return fail(
      422,
      "validation_failed",
      "Submission failed validation.",
      issueDetails(parsed.error),
    );
  }
  const input = parsed.data;

  // AC2 — `industry` must be a real PID slug, re-validated server-side. The
  // same 422 envelope as a zod failure, so the client maps it identically.
  if (input.industry !== undefined) {
    const industries = await listIndustries(input.locale);
    if (!industries.some((industry) => industry.slug === input.industry)) {
      return fail(422, "validation_failed", "Submission failed validation.", [
        { path: "industry", key: "invalid" },
      ]);
    }
  }

  const equipment = await resolveEquipment(input.equipment, input.locale);

  // AC4's column map. What is ABSENT is load-bearing: `reference`, `status`,
  // `source`, `prefillContext` and the attachment columns are not merely
  // omitted — `LeadCreateData` excludes them, so supplying one cannot compile.
  const data: LeadCreateData = {
    industry: input.industry ?? null,
    // The seed's JSONB precedent: the tagged union is JSON-shaped by
    // construction, but named types lack the implicit index signature
    // `InputJsonValue` wants, so the cast is the honest bridge.
    equipment: equipment as unknown as Prisma.InputJsonValue,
    projectDetails: input.projectDetails || null,
    quantities: input.quantities || null,
    timeline: input.timeline ?? null,
    company: input.company,
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    country: input.country || null,
    locale: input.locale,
    consent: true,
    // Server-stamped, never client time (AC4).
    consentAt: new Date(),
    // Task 0 #8: the consent-TEXT locale rides here; `locale` above stays the
    // preferred reply language. The version half is the SHARED constant the
    // /privacy page renders — bumped together or not at all (FR44).
    consentVersion: `${PRIVACY_POLICY_VERSION}:${input.uiLocale}`,
  };

  let created;
  try {
    created = await createLead(data);
  } catch (error) {
    // The ONE failure mode that loses a submission. The client keeps every
    // entered value on screen and invites a retry (AC7's "never lost" half).
    console.error("[rfq] lead insert failed:", error);
    return fail(500, "internal_error", "The inquiry could not be saved. Please try again.");
  }

  // The frozen success shape (3.7a counterfeits exactly this — keep it minimal).
  return Response.json({ reference: created.reference }, { status: 201 });
}
