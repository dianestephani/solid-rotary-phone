# Conversation 04 — Inbound Email Webhook (Phase 4)

**Date:** 2026-02-17
**Participants:** Diane Stephani, Claude (claude-sonnet-4-5-20250929)

---

## Goal

Build a `POST /webhooks/inbound-email` endpoint that receives forwarded emails from Outlook via SendGrid's Inbound Parse service, validates the payload with Zod, saves raw content to the `InboundEmail` table, and secures the route with a shared secret. Introduce a clean controller/service folder architecture that the rest of the API can follow.

---

## Why the new folder structure

The existing `routes/leads.ts` mixed routing, database queries, and response formatting in one file. That was acceptable for the first route. Adding the webhook was the right moment to introduce separation — not to refactor leads, but to establish the pattern for everything going forward.

| Layer | File | Responsibility |
|---|---|---|
| Middleware | `src/middleware/` | Runs before a controller; can abort the request |
| Schema | `src/schemas/` | Zod definitions; pure values with no side effects |
| Controller | `src/controllers/` | HTTP layer only — reads req, calls service, sends res |
| Service | `src/services/` | Business logic and DB calls; no knowledge of HTTP |
| Route | `src/routes/` | Mounts middleware and controller onto Express router |

**Why this matters:**
- The service can be called from a queue worker, a CLI script, or a test without Express machinery
- The controller can be tested by passing a mock req/res without a running server
- The schema is importable anywhere with no side effects (same principle as `env-schema.ts`)
- The middleware is independently testable with mock req/res/next objects

---

## Security: shared secret header

`POST /webhooks/inbound-email` is protected by the `verifyWebhookSecret` middleware.

**How it works:** The middleware reads `process.env.SENDGRID_INBOUND_PARSE_SECRET` and compares it to the value of the `x-webhook-secret` request header. If they match, `next()` is called. Otherwise, a 401 is returned.

**Why a header, not a query param?**
Query params appear in server access logs and can be stored in browser history or proxies. Request headers are not logged by default and are not cached. For a shared secret, this is meaningfully more secure.

**Why not HMAC signature verification?**
SendGrid's _event_ webhook signs payloads with HMAC-SHA256. SendGrid's _inbound parse_ webhook does not — there is no signature field in the POST body. The shared secret pattern is the correct approach for this webhook type.

**What happens if the env var is missing?**
The middleware returns 500 rather than allowing the request through. This cannot happen in normal operation because `env.ts` crashes the server at startup if `SENDGRID_INBOUND_PARSE_SECRET` is absent — but the middleware guards independently so it is safe to unit test without `env.ts`.

---

## SendGrid payload format

SendGrid Inbound Parse POSTs `multipart/form-data` (or `application/x-www-form-urlencoded` in some configurations), not JSON. This means `express.json()` — applied globally in `index.ts` — will not parse the body for this route.

**Fix:** `express.urlencoded({ extended: true })` is applied to the webhooks router only. It does not affect any other route.

**Fields used:**

| Field | Type | Notes |
|---|---|---|
| `from` | string | `"Name <email>"` or plain address |
| `to` | string | The inbound parse domain address |
| `subject` | string | Defaults to `""` if absent |
| `text` | string? | Plain-text body (may be absent on HTML-only emails) |
| `html` | string? | HTML body (may be absent on plain-text-only emails) |
| `envelope` | string | JSON string: `{"from":"...","to":["..."]}` |

At least one of `text` or `html` must be present — the Zod schema enforces this with a top-level `.refine()`.

---

## rawText storage strategy

The service stores `text ?? html ?? ""`. This gives downstream processing a single consistent field to read from regardless of whether the email arrived as plain text or HTML. The Zod schema already guarantees at least one is present and non-empty.

---

## Why 200, not 201

The controller returns 200 on success. SendGrid retries any non-2xx response, so getting the status code right matters. 200 is conventional for webhooks — the caller does not need the ID of the created resource.

---

## Files created this session

| File | Change |
|---|---|
| `apps/api/src/middleware/verify-webhook-secret.ts` | New — shared secret check as standalone Express middleware |
| `apps/api/src/schemas/inbound-email.ts` | New — Zod schema for SendGrid inbound parse payload |
| `apps/api/src/services/inbound-email.service.ts` | New — `saveInboundEmail()` function; owns the DB write |
| `apps/api/src/controllers/inbound-email.controller.ts` | New — HTTP handler; validates body, calls service, sends response |
| `apps/api/src/routes/webhooks.ts` | New — mounts `express.urlencoded`, middleware, and controller |
| `apps/api/src/index.ts` | Added `app.use("/webhooks", webhooksRouter)` |
| `apps/api/src/__tests__/inbound-email-schema.test.ts` | New — 19 tests for the Zod schema |
| `apps/api/src/__tests__/verify-webhook-secret.test.ts` | New — 7 tests for the middleware using mock req/res/next |
| `README.md` | Updated test table, planned features checklist, architecture log |

---

## Test approach: middleware without Express

The middleware tests use hand-rolled mock objects instead of a test HTTP framework (supertest). This is faster and keeps tests at the pure unit level — no server spins up.

**The fix that was needed:** The first version of `mockRes()` spread initial values (`undefined`) into the returned object at construction time. Later mutations to `mock.statusCode` were invisible to the test because it was reading a stale snapshot. The fix was to make `statusCode` and `body` live directly on a shared object so reads always reflect the current value.

```typescript
// Wrong: spread captures undefined at construction time
return { res, ...captured };

// Correct: single object; reads always see the current value
const mock = { res: null, statusCode: undefined, body: undefined };
mock.res = { status(code) { mock.statusCode = code; ... } };
return mock;
```

---

## Test counts after this session

| File | Tests |
|---|---|
| `env.test.ts` | 45 |
| `leads-schema.test.ts` | 44 |
| `inbound-email-schema.test.ts` | 19 |
| `verify-webhook-secret.test.ts` | 7 |
| **Total** | **115** |

---

## Open questions / next steps

- [ ] Outreach dispatch service — send SMS via Twilio, send email via SendGrid
- [ ] Twilio inbound SMS webhook handler (`POST /webhooks/inbound-sms`)
- [ ] Outreach status tracking and reply logging (update Lead.status, create MessageLog)
- [ ] Authentication strategy decision (API key vs JWT)
- [ ] CI pipeline (GitHub Actions — run `pnpm -w run test` on every push)
- [ ] Next.js dashboard (`apps/web`) — leads list, outreach composer, message history
