import type { Locale, Prisma } from "@prisma/client";
import { siteOrigin } from "@/lib/seo";
import { rfqSchema, issueDetails, type RfqInput } from "@/server/rfq/schema";
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
 *      POSTs carry no Origin). Compared against `siteOrigin()`, never the Host
 *      header — Host/X-Forwarded-Host trust is Story 3.7a's written
 *      trusted-proxy policy and must not be half-implemented here.
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
 *     strategy for that fake reference.
 * Neither exists in 3.2: no limiter, no counter, no 429, by the sprint
 * proposal's split (3.7a is merge-gated to this story on the same branch).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * After validation, the handler resolves against the DB (guards passed, so
 * these reads are not attacker-amplified beyond one bounded submission):
 * `industry` must be a real PID slug (`listIndustries` — AC2), and
 * `product`/`category` equipment labels are re-resolved to display names at
 * submit time where resolvable (AC4 snapshot semantics; the buyer-typed label
 * survives only when the slug no longer resolves). In 3.2 the form itself only
 * emits `freeText` items — the catalog kinds arrive with Story 3.4's pre-fill —
 * but a direct POST may send them today, so the endpoint handles them today.
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

  return Promise.all(
    items.map(async (item): Promise<LeadEquipmentItem> => {
      if (item.kind === "freeText") return { kind: "freeText", text: item.text };
      if (item.kind === "product") {
        const product = await getProductBySlug(item.slug, locale);
        return { kind: "product", slug: item.slug, label: product?.name ?? item.label };
      }
      const category = findCategory(categoryTree, item.slug);
      return { kind: "category", slug: item.slug, label: category?.name ?? item.label };
    }),
  );
}

export async function POST(request: Request) {
  // Guard 1 — media type, not string equality (`;charset=utf-8` is legal).
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return fail(415, "unsupported_media_type", "Only application/json bodies are accepted.");
  }

  // Guard 2 — Origin: present-and-mismatched → reject + log; absent → allow.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== siteOrigin()) {
    console.warn(`[rfq] cross-origin POST rejected (origin ${origin})`);
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
    // preferred reply language. The version prefix changes when Story 5.1
    // replaces the stub with the real policy.
    consentVersion: `privacy-2026-08-stub:${input.uiLocale}`,
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
