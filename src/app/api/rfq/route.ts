import type { Locale, Prisma } from "@prisma/client";
import { siteOrigin } from "@/lib/seo";
import { checkRateLimit, describeClientKey } from "@/lib/rate-limit";
import {
  rfqSchema,
  issueDetails,
  isStorableText,
  PRIVACY_POLICY_VERSION,
  type RfqInput,
} from "@/server/rfq/schema";
import type { LeadEquipmentItem } from "@/server/rfq/contracts";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentStorageKey,
  validateAttachment,
  type AttachmentFormat,
  type AttachmentRejectionKey,
} from "@/server/rfq/attachment";
import { scanBuffer } from "@/lib/clamav";
import { putObject } from "@/lib/storage";
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
 *   1. media-type gate → 415. `application/json` and, since Story 3.7b,
 *      `multipart/form-data`; everything else is refused.
 *
 *      ⚠️ DISCLOSED THREAT-MODEL CHANGE (Story 3.7b, AC1). Accepting multipart
 *      COSTS A DEFENCE LAYER, and it is written here rather than left to be
 *      discovered. A cross-origin `application/json` POST requires a CORS
 *      preflight, which this route never grants (no CORS headers anywhere in
 *      this file — that absence was load-bearing). A multipart form POST is a
 *      SIMPLE REQUEST: no preflight exists to withhold. So the strict-JSON
 *      gate's cross-site protection is GONE, and guard 2's Origin check is now
 *      the single remaining browser-facing layer. The absent-Origin allowance
 *      below stays as it was — non-browser clients are unauthenticated here by
 *      design and always were — so what changed is one layer of defence in
 *      depth against a browser-driven cross-site POST, not the endpoint's
 *      authentication posture. Never remove or weaken the Origin check.
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
 *   3. self-imposed body cap → 413, with the ceiling SELECTED BY MEDIA TYPE
 *      (Story 3.7b, AC1/AC2). Route handlers have NO built-in limit
 *      (`bodySizeLimit` is Server-Actions-only): Content-Length is checked
 *      first, then the stream is read with a byte counter because chunked
 *      transfer has no Content-Length and the header can lie. JSON keeps 64 KB
 *      — a JSON POST declaring 15 MB still 413s — while multipart gets the
 *      attachment limit plus the payload limit plus named framing slack.
 *   4. parse → 422 `invalid_body`. JSON directly; multipart via its `payload`
 *      part, which is the SAME JSON object (Task 0 #2), so there is one schema
 *      and one set of error keys rather than two encodings that can drift.
 *   5. shared zod schema + attachment intake → 422 `validation_failed` with
 *      `{ path, key }` details. Consent is `z.literal(true)` INSIDE the schema,
 *      so a `consent: false` POST dies here — the create below is unreachable
 *      without it. The attachment's size/extension/magic-byte verdict rides the
 *      same envelope on `path: "attachment"`.
 *   6. ClamAV, SYNCHRONOUSLY, BEFORE ANY UPLOAD (Story 3.7b — FR32a) → 422
 *      `scanFailed`. See `@/lib/clamav` for why in-handler beats a worker here
 *      (the epics' latency premise was measured false) and why the per-
 *      connection deadline is the part that is not optional (`MaxScanTime` is
 *      disabled server-side with archive scanning on).
 *
 * ⚠️ MEMORY, HONESTLY (Story 3.7b, AC2). The streaming cap bounds what is
 * ACCEPTED, but `formData()` then buffers everything that passes: peak usage is
 * roughly 3× the file (measured: +192 MB arrayBuffers / +200 MB RSS for a 64 MB
 * body). The 3.7a limiter bounds RATE PER BUCKET, not CONCURRENCY, and distinct
 * IPs mint distinct buckets — so N simultaneous 15 MB uploads cost ≈45 MB × N
 * regardless of the limiter. Nothing in this repo caps concurrency; that is a
 * deployment-level control (a reverse-proxy `client_max_body_size` and worker
 * limit, or a platform request cap), and it is named here so the ceiling is a
 * decision someone makes rather than one a production incident discovers.
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

/**
 * AC3's self-imposed cap, and it stays BOUND TO THE JSON BRANCH (Story 3.7b,
 * AC1). A JSON POST declaring 15 MB must still 413 on the header short-circuit:
 * widening one number for both branches would have quietly given every JSON
 * body a 15 MB allowance, which is 240× what the schema can possibly accept.
 */
const BODY_LIMIT_BYTES = 64 * 1024;

/**
 * Framing slack for the multipart branch: boundary delimiters, per-part headers
 * and the `filename=` line. Named rather than folded into the sum so the
 * ceiling below reads as "one attachment + one JSON payload + framing" and
 * nobody has to reverse-engineer a magic constant.
 */
const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

/** The multipart ceiling: the FR32a attachment limit, the JSON payload's own
 *  limit, and the framing between them. Enforced on the stream, not after. */
const MULTIPART_LIMIT_BYTES = ATTACHMENT_MAX_BYTES + BODY_LIMIT_BYTES + MULTIPART_OVERHEAD_BYTES;

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
 * Read the body with a byte counter, or return null past `limit`. The
 * Content-Length short-circuit avoids reading a declared-oversize body at all;
 * the counter is the defence when the header is absent or lying.
 *
 * `limit` is a PARAMETER as of Story 3.7b (AC1/AC2) so the media type selects
 * the ceiling. The counter is what makes AC2's "aborted at the ceiling
 * mid-stream" true: a request that understates its length is cancelled the
 * moment it crosses the cap, having buffered at most one chunk more than the
 * limit — never the whole 64 MB an attacker might be sending.
 *
 * Returns BYTES, not a string: the multipart branch must hand these to a MIME
 * parser, and decoding a binary body as UTF-8 first would corrupt it. A plain
 * `Uint8Array` rather than a `Buffer` because that is what `BodyInit` accepts,
 * and because collecting the reader's own chunks avoids a per-chunk copy.
 */
// `Uint8Array<ArrayBuffer>`, not bare `Uint8Array`: TypeScript 5.7 made the
// backing-buffer kind a type parameter, and `BodyInit` accepts only the
// ArrayBuffer-backed form. The default `ArrayBufferLike` would also admit a
// SharedArrayBuffer view, which `new Response(...)` cannot take.
async function readBodyCapped(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;

  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** One validated, in-memory attachment on its way to the scanner. */
interface PendingAttachment {
  name: string;
  bytes: Uint8Array;
  format: AttachmentFormat;
}

type AttachmentIntake =
  { ok: true; attachment: PendingAttachment | null } | { ok: false; key: AttachmentRejectionKey };

/**
 * Turn the `attachment` part of a multipart body into a validated attachment,
 * or into ONE rejection key (AC3 — never a generic one).
 *
 * An absent part and an EMPTY part are both "no attachment": several browsers
 * submit a zero-byte, unnamed `File` for an untouched file input, and treating
 * that as a corrupt upload would 422 every buyer who simply did not attach
 * anything.
 */
async function readAttachment(part: FormDataEntryValue | null): Promise<AttachmentIntake> {
  if (part === null) return { ok: true, attachment: null };
  // A `attachment` sent as a plain text field is a malformed request, not an
  // empty one — say so rather than silently ignoring it.
  if (typeof part === "string") return { ok: false, key: "invalid" };
  if (part.size === 0 && part.name === "") return { ok: true, attachment: null };

  const bytes = new Uint8Array(await part.arrayBuffer());
  const result = validateAttachment(part.name, bytes, isStorableText);
  if (!result.ok) return { ok: false, key: result.key };
  return { ok: true, attachment: { name: part.name.trim(), bytes, format: result.format } };
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
  // Guard 1 — media type, not string equality (`;charset=utf-8` is legal, and
  // multipart ALWAYS carries a `boundary=` parameter). Two types are accepted
  // as of Story 3.7b; everything else still 415s, which is the branch that
  // proves the gate still gates.
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  const isMultipart = mediaType === "multipart/form-data";
  if (mediaType !== "application/json" && !isMultipart) {
    return fail(
      415,
      "unsupported_media_type",
      "Only application/json and multipart/form-data bodies are accepted.",
    );
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
  const client = describeClientKey(request.headers.get("x-forwarded-for"));
  if (client.unparsed) {
    // The misconfigured-edge detector (3.7a review). An edge that writes a
    // form this policy cannot parse funnels EVERY buyer into the single
    // "unknown" bucket, and the sixth genuine inquiry site-wide per hour then
    // 429s — a silent rolling funnel outage otherwise indistinguishable from
    // ordinary throttling. Throttled to one line per 30s; the value is
    // truncated because the header is attacker-controlled.
    console.warn(
      `[rfq-rl] rightmost x-forwarded-for entry is not an IP — all such traffic shares one bucket: ${(request.headers.get("x-forwarded-for") ?? "").slice(0, 200)}`,
    );
  }
  const rate = await checkRateLimit({
    keyspace: "rfq:rl:",
    client: client.key,
    limit: RFQ_RATE_LIMIT,
    windowSeconds: RFQ_RATE_WINDOW_SECONDS,
    label: "rfq-rl",
  });
  if (!rate.allowed) {
    // The bucket is logged so ONE key dominating the 429s is greppable — the
    // signature of a collapsed bucket (an edge that writes no XFF at all, so
    // every buyer shares the edge's own address) versus real abuse.
    console.warn(`[rfq] rate limited bucket=${client.key}`);
    return fail(
      429,
      "rate_limited",
      "Too many submissions from this client. Please wait before trying again.",
      undefined,
      { "Retry-After": String(rate.retryAfterSeconds ?? RFQ_RATE_WINDOW_SECONDS) },
    );
  }

  // Guard 3 — size, with the ceiling SELECTED BY MEDIA TYPE (Story 3.7b, AC1).
  const limit = isMultipart ? MULTIPART_LIMIT_BYTES : BODY_LIMIT_BYTES;
  const body = await readBodyCapped(request, limit);
  if (body === null) {
    return fail(413, "payload_too_large", "Request body exceeds the accepted size limit.");
  }

  // Guard 4 — parse. Malformed JSON → 422 `invalid_body` (revalidate precedent).
  //
  // THE MULTIPART CONTRACT (Story 3.7b, Task 0 #2 — one request, one commit):
  // exactly two parts. `payload` is the SAME JSON object the JSON branch
  // accepts, so there is ONE schema and one set of stable error keys rather
  // than a second field-by-field encoding that could drift from it; the
  // honeypot's `website` travels inside it untouched. `attachment` is the file.
  // The payload part keeps the JSON branch's own 64 KB ceiling.
  //
  // FIRST-WINS on duplicate part names (3.7b review): `form.get` returns the
  // FIRST part called `attachment`, so a hand-built request carrying two files
  // has its second silently ignored. Deliberate and cheap-by-construction —
  // the UI renders ONE file input with no `multiple`, so only a direct caller
  // can produce the case, and for them "first wins" is the documented semantic
  // rather than an accident.
  let json: unknown;
  let attachmentPart: FormDataEntryValue | null = null;
  if (isMultipart) {
    let form: FormData;
    try {
      // Re-wrap the ALREADY-CAPPED bytes so the platform MIME parser runs on a
      // body whose size we have already bounded. Calling `request.formData()`
      // directly would parse first and let us complain afterwards, which is
      // exactly the "enforced after buffering" AC2 forbids.
      form = await new Response(body, { headers: { "content-type": contentType! } }).formData();
    } catch {
      return fail(422, "invalid_body", "Request body is not valid multipart/form-data.");
    }
    const payload = form.get("payload");
    if (typeof payload !== "string") {
      return fail(422, "invalid_body", "Multipart submissions must carry a `payload` JSON part.");
    }
    if (Buffer.byteLength(payload, "utf8") > BODY_LIMIT_BYTES) {
      return fail(413, "payload_too_large", "Request body exceeds the accepted size limit.");
    }
    attachmentPart = form.get("attachment");
    try {
      json = JSON.parse(payload);
    } catch {
      return fail(422, "invalid_body", "Request body is not valid JSON.");
    }
  } else {
    try {
      json = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return fail(422, "invalid_body", "Request body is not valid JSON.");
    }
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
  //
  // Guard 5b — the attachment, validated IN THE SAME PASS (Story 3.7b, AC3) so
  // a buyer with both a missing field and a wrong file hears about both at
  // once. The file's own rejection key rides the standard `{ path, key }`
  // envelope on `path: "attachment"`, which the client already maps through
  // `t()` like any other field error.
  const parsed = rfqSchema.safeParse(json);
  const intake = await readAttachment(attachmentPart);
  const details = [
    ...(parsed.success ? [] : issueDetails(parsed.error)),
    ...(intake.ok ? [] : [{ path: "attachment", key: intake.key }]),
  ];
  if (details.length > 0) {
    return fail(422, "validation_failed", "Submission failed validation.", details);
  }
  // Both branches above are `ok` here; the narrowing needs the explicit checks.
  if (!parsed.success || !intake.ok) {
    return fail(422, "validation_failed", "Submission failed validation.");
  }
  const input = parsed.data;
  const attachment = intake.attachment;

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

  // Guard 6 — THE SCAN, BEFORE STORAGE (Story 3.7b, Task 0 #7; FR32a).
  //
  // Scanning before the upload rather than after is what makes FR32a's
  // "malware-scanned before storage" literally true: an infected file never
  // reaches the bucket at all, so there is no infected object to reconcile, no
  // orphan when the honeypot path below writes no row, and nothing to clean up
  // if the request dies mid-flight.
  //
  // BOTH non-clean outcomes answer with the SAME key, deliberately (Task 0
  // #12). "We found malware" and "we could not tell" leave the buyer with the
  // identical next action — retry, or send the inquiry without the file — and
  // reporting a signature match back to whoever uploaded it turns this
  // endpoint into a free malware-detection oracle. The distinction that
  // matters to US is in the logs, where it belongs.
  //
  // DISCLOSED COST of failing closed on `failed`: while clamd is unreachable,
  // submissions WITH an attachment are rejected. Submissions without one are
  // completely unaffected (the scanner is only consulted when a file is
  // present), and the 422 keeps every entered value on screen, so no inquiry
  // is lost — the buyer is told, and can send without the file. The opposite
  // choice, storing unscanned bytes during an outage, is the one FR32a forbids.
  if (attachment) {
    const outcome = await scanBuffer(attachment.bytes);
    if (outcome.status !== "clean") {
      const reason =
        outcome.status === "infected"
          ? `infected (${outcome.signature})`
          : `scan ${outcome.reason}`;
      console.warn(`[rfq-attach] attachment rejected: ${reason} bytes=${attachment.bytes.length}`);
      return fail(422, "validation_failed", "Submission failed validation.", [
        { path: "attachment", key: "scanFailed" },
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
      // The RESPONSE mirrors the real path's failure exactly (that is the
      // attacker-visible surface). The LOG does not: an operator reading
      // "lead insert failed" for a honeypot burn would be chasing a
      // nonexistent lost lead (3.7a review).
      console.error("[rfq] honeypot burn failed:", error);
      return fail(500, "internal_error", "The inquiry could not be saved. Please try again.");
    }
    const websiteLength = ((json as Record<string, unknown>).website as string).length;
    console.warn(`[rfq] honeypot_filled ref=${fakeReference} len=${websiteLength}`);
    return Response.json({ reference: fakeReference }, { status: 201 });
  }

  // The upload, and the ONE state machine that decides what the row records
  // (Story 3.7b, AC5). Reached only on a CLEAN scan and only past the honeypot,
  // so nothing an attacker sends and nothing a trapped bot sends is ever stored.
  //
  // `attachmentScanStatus` is written in the SAME insert as `attachmentKey` —
  // never patched in afterwards — because `null` on that column means "no
  // attachment", NOT "unscanned" (schema.prisma:65-67). One statement makes the
  // "has a file, has no verdict" row unreachable rather than merely unlikely.
  //
  // UPLOAD FAILURE KEEPS THE LEAD (FR29). Persist-first means an attachment can
  // never cost an inquiry, so a storage outage records `failed` with NO key —
  // an honest row saying "they attached this file and we could not keep it" —
  // and the inquiry itself still succeeds. The alternative, 500ing on a MinIO
  // hiccup, would throw away a qualified lead to protect a convenience.
  let attachmentColumns: Partial<LeadCreateData> = {};
  if (attachment) {
    const key = attachmentStorageKey(attachment.format.extension);
    const shared = {
      // The buyer's original filename — stored, displayed, and NEVER part of
      // the key (it is attacker-controlled text).
      attachmentName: attachment.name,
      attachmentMime: attachment.format.mime,
      attachmentSizeBytes: attachment.bytes.length,
      attachmentScannedAt: new Date(),
    };
    try {
      await putObject(key, attachment.bytes, attachment.format.mime);
      attachmentColumns = { ...shared, attachmentKey: key, attachmentScanStatus: "clean" };
    } catch (error) {
      console.error("[rfq-attach] upload failed after a clean scan — lead kept, file lost:", error);
      attachmentColumns = { ...shared, attachmentKey: null, attachmentScanStatus: "failed" };
    }
  }

  let created;
  try {
    created = await createLead({ ...data, ...attachmentColumns });
  } catch (error) {
    // The ONE failure mode that loses a submission. The client keeps every
    // entered value on screen and invites a retry (AC7's "never lost" half).
    console.error("[rfq] lead insert failed:", error);
    return fail(500, "internal_error", "The inquiry could not be saved. Please try again.");
  }

  // The frozen success shape (the honeypot path above counterfeits exactly this).
  return Response.json({ reference: created.reference }, { status: 201 });
}
