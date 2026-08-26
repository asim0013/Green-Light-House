import type { Locale, Prisma } from "@prisma/client";
import { siteOrigin } from "@/lib/seo";
import { checkRateLimit, clientKeyFromForwardedFor } from "@/lib/rate-limit";
import {
  rfqSchema,
  issueDetails,
  PRIVACY_POLICY_VERSION,
  type RfqInput,
} from "@/server/rfq/schema";
import type { LeadEquipmentItem } from "@/server/rfq/contracts";
import { burnLeadReference, createLead, type LeadCreateData } from "@/server/repositories/lead";
import { listIndustries } from "@/server/repositories/industry";
import { getProductBySlug } from "@/server/repositories/product";
import { listCategoryTree, type CategoryTreeNode } from "@/server/repositories/category";

/**
 * `POST /api/rfq` — the app's first unauthenticated write endpoint (Story 3.2,
 * AC3/AC4; anti-abuse landed by Story 3.7a). Persist-first: success IS the
 * Prisma commit. The ONLY Redis touch is the rate limiter, which FAILS OPEN and
 * can never reach the persist path — only Postgres-down loses a lead, and that
 * path writes nothing.
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
 *      deliberately — and 3.7a's trusted-proxy policy below does NOT change
 *      that: the policy governs the rate-limit KEY, where a spoof only
 *      self-buckets the spoofer; an auth-adjacent comparison trusting
 *      Host/X-Forwarded-Host would let a spoofed header defeat the check. A
 *      deployment whose serving origin differs from SITE_URL rejects browser
 *      POSTs; SITE_URL being right is already load-bearing for every
 *      canonical/hreflang on the site.
 *   2.5 rate limiter (Story 3.7a — FR32) → 429, BEFORE the body is read:
 *      fixed window of 5 per client per hour on the CACHE Redis
 *      (`rfq:rl:<client>`, `REDIS_URL`, never the durable queue instance),
 *      with `Retry-After` from the window's remaining TTL. Fails OPEN, coded
 *      and bounded (`@/lib/rate-limit` — `[rfq-rl]` in the logs), so a Redis
 *      outage can never cost a lead (FR27). Note the seam consequence: 415s
 *      and 403s above never consume budget; 422s below DO (counting happens
 *      before the body is even read).
 *
 *      THE WRITTEN TRUSTED-PROXY POLICY (epics:938; Task 0 #6): the client key
 *      is the RIGHTMOST `x-forwarded-for` entry — production runs behind
 *      exactly ONE trusted edge that appends (or replaces) the header, so the
 *      rightmost entry is edge-written and every hop left of it is ignored as
 *      client-supplied noise. Entries are `net.isIP`-validated and length-
 *      capped; anything malformed shares the single `"unknown"` bucket, so
 *      junk can never mint keys. Next's standalone server fills the header
 *      from the socket when absent (proven live at implementation), so
 *      direct-connect dev still buckets per socket — but there a client-sent
 *      header passes through untouched, so HONESTLY: the spoof-resistance
 *      guarantee holds BEHIND THE TRUSTED EDGE; the shipped docker-compose is
 *      direct-connect and gets best-effort throttling of naive bots only.
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
 * THE HONEYPOT (Story 3.7a — FR32's other half; Task 0 #1, an ASIM decision):
 * a non-empty `website` value — read off the RAW parse, because the shared
 * schema STRIPS the field and a check on `parsed.data` could never fire — runs
 * the ENTIRE validation chain and diverges only at the persist step: instead
 * of a row, a real `nextval('lead_reference_seq')` is BURNED (sanctioned gap
 * doctrine, schema.prisma — a burned value can never collide with a real
 * lead's) and the route's exact success shape returns, `201 { reference }`.
 * SILENT DROP + RECOVERY LOG: the epics mandate the drop; the 3.2 review's
 * autofill warning (a form-filler CAN populate the hidden field for a real
 * buyer) is answered by the log line, which carries the fabricated reference —
 * a buyer phoning in a reference that matches nothing reconciles to that line.
 * The log never carries the field's value or the submitter's PII: the drop
 * decision means we deliberately hold none. If the burn itself throws
 * (Postgres down), the response is the route's exact 500 — indistinguishable
 * from the real path in failure as well as success.
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
 * costs one lookup) and request RATE is now bounded too — 5 per client per
 * hour (3.7a) — WITH the policy's honest scope: behind the trusted edge that
 * bound is per-IP; in direct-connect it is best-effort. Unknown-but-valid-
 * shaped product slugs still mint cached-null id-hop entries within budget
 * (the 2.2 slug-gate bounds shape, never cardinality).
 */

/** FR32's numbers (prd:153): the window's 6th submission is rejected. */
const RFQ_RATE_LIMIT = 5;
const RFQ_RATE_WINDOW_SECONDS = 3600;

/** AC3's self-imposed cap. Attachments are 3.7b's and arrive multipart — 415'd. */
const BODY_LIMIT_BYTES = 64 * 1024;

/** Architecture § Format — errors are `{ error: { code, message, details? } }`. */
function fail(
  status: number,
  code: string,
  message: string,
  details?: { path: string; key: string }[],
  headers?: Record<string, string>,
): Response {
  return Response.json(
    { error: details ? { code, message, details } : { code, message } },
    { status, headers },
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

  // Guard 2.5 — the rate limiter (Story 3.7a), BEFORE the body is read:
  // epics:934's placement, so a rejected-later request still consumed budget
  // and a junk content-type (already 415'd above) never did. Fail-open lives
  // inside checkRateLimit; a Redis outage cannot reach the persist path.
  const rate = await checkRateLimit({
    keyspace: "rfq:rl:",
    client: clientKeyFromForwardedFor(request.headers.get("x-forwarded-for")),
    limit: RFQ_RATE_LIMIT,
    windowSeconds: RFQ_RATE_WINDOW_SECONDS,
    label: "rfq-rl",
  });
  if (!rate.allowed) {
    return fail(
      429,
      "rate_limited",
      "Too many submissions from this client. Please wait before trying again.",
      undefined,
      { "Retry-After": String(rate.retryAfterSeconds ?? RFQ_RATE_WINDOW_SECONDS) },
    );
  }

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

  // The honeypot FLAG (Story 3.7a) is read HERE — off the RAW parse, because
  // the shared schema strips `website` and a later read could never fire. The
  // DIVERGENCE happens at the persist step below: the full validation chain
  // runs first, so a bot posting garbage sees the same 422s as anyone
  // (indistinguishability — see the module docstring).
  const honeypotFilled =
    typeof (json as Record<string, unknown>).website === "string" &&
    ((json as Record<string, unknown>).website as string).trim() !== "";

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

  // The honeypot divergence (Task 0 #1/#2 — silent drop + recovery log): same
  // chain, same success shape, no row — a burned sequence value instead. The
  // log line is the recovery path: it never carries the field's value or the
  // submitter's PII, only the fabricated reference a false-positive buyer
  // might later quote.
  if (honeypotFilled) {
    let fakeReference;
    try {
      fakeReference = await burnLeadReference();
    } catch (error) {
      // Postgres down: mirror the real path's failure exactly.
      console.error("[rfq] lead insert failed:", error);
      return fail(500, "internal_error", "The inquiry could not be saved. Please try again.");
    }
    const websiteLength = ((json as Record<string, unknown>).website as string).length;
    console.warn(`[rfq] honeypot_filled ref=${fakeReference} len=${websiteLength}`);
    return Response.json({ reference: fakeReference }, { status: 201 });
  }

  let created;
  try {
    created = await createLead(data);
  } catch (error) {
    // The ONE failure mode that loses a submission. The client keeps every
    // entered value on screen and invites a retry (AC7's "never lost" half).
    console.error("[rfq] lead insert failed:", error);
    return fail(500, "internal_error", "The inquiry could not be saved. Please try again.");
  }

  // The frozen success shape (the honeypot path above counterfeits exactly this).
  return Response.json({ reference: created.reference }, { status: 201 });
}
