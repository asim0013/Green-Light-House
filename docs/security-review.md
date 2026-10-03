# Security review — pre-launch (NFR6)

Story 5.7. This is the standing record of GLH's security posture: each NFR6 item, its status,
where it is enforced, and the test that keeps it honest. Updated 2026-10-04.

## Response headers (Story 5.7)

| Header | Value | Where | Scope |
|---|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`; nonce'd `script-src` + `'strict-dynamic'`; `style-src 'self' 'unsafe-inline'`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri`/`form-action 'self'`; no third-party origins | `src/proxy.ts` (per-request nonce) | page routes (proxy matcher; excludes `/api`, assets) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | `next.config.ts` `headers()` | every route |
| `X-Content-Type-Options` | `nosniff` | `next.config.ts` | every route |
| `X-Frame-Options` | `DENY` (+ CSP `frame-ancestors 'none'`) | `next.config.ts` + proxy | every route |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `next.config.ts` | every route |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | `next.config.ts` | every route |

- **CSP is a real nonce-CSP**, not `'unsafe-inline'` scripts: `proxy.ts` mints a nonce per request,
  sets it on the request headers (next-intl forwards them), and Next applies it to its inline
  RSC-flight scripts. Verified in a prod build: the CSP-header nonce equals the script nonce and
  every key page + admin renders with ZERO console CSP violations. Dev loosens to `'unsafe-eval'` +
  `ws:` (React dev + HMR) gated on `NODE_ENV`; the shipped policy is strict.
- **HSTS is the header only.** TLS termination + HTTP→HTTPS redirect are the deploy layer — an OWNER
  ACTION (see `owner-actions.md` §0; ties to the OQ7 hosting decision).

## NFR6 control checklist

| Control | Status | Where enforced | Test |
|---|---|---|---|
| HTTPS (HSTS header) | ✅ header shipped; redirect = owner action | `next.config.ts`; deploy | `e2e/security-headers.spec.ts` |
| Inputs validated at all boundaries | ✅ | zod on `/api/rfq` (schema.ts), `/api/revalidate`, admin document/media routes; safe FormData coercion + Origin + rate-limit + length on the auth routes | route `.test.ts` + `rfq.spec.ts` |
| No price/PII public (FR2) | ✅ | React auto-escaping; no prices in the model surfaced publicly | currency sweep (`/[$€₺]\s?\d/`) in `product-detail.spec.ts`, `catalog.spec.ts`, `home.spec.ts`, `industries.spec.ts`, `services.spec.ts`, `documents.spec.ts` |
| Unpublished non-enumerable | ✅ | repositories filter `status: "published"` / `publishedAt` (product.ts, project.ts, selection-guide.ts). A draft/unknown product or project renders a 200 **noindex soft-404 body IDENTICAL to a nonexistent slug** (it never leaks the draft's name); guides return a real 404. Either way the item is non-enumerable. | `selection-guide.integration.test.ts` ("hides a draft…"), `repository.integration.test.ts`, catalog/content-write integration tests |
| Admin auth lockout | ✅ | `login:rl:` rate-limit before verify; non-enumerable forgot/reset; single-use hashed expiring token; `jose` HS256 cookie, AUTH_SECRET≥32 fail-closed | `lib/auth/*.test.ts`, `rate-limit.test.ts` |
| RFQ rate-limit | ✅ | `src/lib/rate-limit.ts` keyed `rfq:rl:*`, IPv6 /64, fail-open+log, in `api/rfq/route.ts` | `rate-limit.test.ts`, `rfq.spec.ts` |
| Attachment scanning | ✅ | `src/lib/clamav.ts` scan-before-parse + quarantine (3.7b) | `clamav.test.ts` |
| Admin boundary (defence in depth) | ✅ | `proxy.ts` page guard + `requireAdmin()` in every admin mutation + Origin check; `/api` checked in-handler (matcher excludes it) | `auth/admin-path.test.ts`, route tests |
| Frame/clickjacking | ✅ | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` | `e2e/security-headers.spec.ts` |

## Boundary-validation audit (`/api/**`)

| Route | Validation |
|---|---|
| `api/rfq` | zod (17 checks), hostile-codepoint reject, honeypot, rate-limit, Origin |
| `api/revalidate` | zod (tag allow-list) |
| `api/admin/documents`, `.../replace`, `api/admin/media` | zod + `requireAdmin` + Origin |
| `api/admin/login` | Origin check, FormData coercion, rate-limit, timing-safe non-enumerable verify |
| `api/admin/forgot` | Origin, rate-limit, non-enumeration (equal argon2 cost), trimmed email |
| `api/admin/reset` | Origin, single-use hashed+expiring token, MIN_PASSWORD, generic failure |
| `api/admin/logout` | Origin; no body |
| `api/documents/[slug]`, `api/media/[id]`, `api/projects/[slug]/media/[id]` | slug/id validated; published/public filter at the repo |

The auth routes validate via safe `FormData` coercion + semantic + Origin + rate-limit checks rather
than zod — a stronger boundary than a shape parse alone; the AC's "zod-validated at all boundaries" is
satisfied in substance (every boundary validates; zod is the mechanism where a JSON body shape matters).

## Owner actions (deploy layer — not code)

- ⛔ **TLS termination + HTTP→HTTPS redirect** at the host/proxy (the HSTS header is shipped; the
  redirect is the host's job). Ties to the OQ7 hosting decision. See `owner-actions.md` §0.
- Set `SITE_ALLOW_INDEXING=true` only at go-live; `AUTH_SECRET` ≥ 32 bytes in the prod env.
