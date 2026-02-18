# Conversation 05 — Email Parsing and Lead Creation (Phase 5)

**Date:** 2026-02-17
**Participants:** Diane Stephani, Claude (claude-sonnet-4-5-20250929)

---

## Goal

Given a consistently-formatted forwarded email body, parse it into structured lead data, normalize the phone number to E.164, upsert the lead into the database, and mark the inbound email record as processed. Ensure the full pipeline is idempotent — running it twice on the same email produces no duplicate leads.

---

## Email format (version 1)

The forwarded email body from Outlook always arrives in this format:

```
Name: John Smith
Phone: 555-123-4567
Email: john@email.com
```

**This format is the single source of truth for the parser.** The format version is documented in `lead-parser.service.ts` alongside the regexes. If the format changes (field order, label casing, additional fields), that file is the one place to update, and the test suite will immediately catch anything that broke.

---

## Why idempotency matters

SendGrid retries webhook delivery on any non-2xx response, and also retries on connection timeouts. Outlook's forwarding rules can fire more than once for the same message if the destination was temporarily unavailable. Without idempotency:

- The same contact appears in the CRM twice
- Outreach sequences are triggered twice for the same person
- Data integrity becomes dependent on careful manual management

Idempotency eliminates this class of bug entirely.

---

## How idempotency is implemented: two layers

### Layer 1 — Database unique constraint

`Lead.email` was changed from `@@index([email])` to `@@unique([email])` in the Prisma schema. This is enforced at the database level — no application code can create two leads with the same email. A migration was generated and applied:

```sql
-- Phase 5: make Lead.email unique for idempotent upsert on inbound email processing
DROP INDEX "Lead_email_idx";
CREATE UNIQUE INDEX "Lead_email_key" ON "Lead"("email");
```

The unique index also serves as the lookup index, so no performance is lost compared to the previous `@@index`.

### Layer 2 — Upsert with empty update

The orchestration service uses `prisma.lead.upsert()` keyed on `email`:

```typescript
const lead = await prisma.lead.upsert({
  where: { email },
  create: { name, email, phone },
  update: {}, // intentionally empty — first email wins
});
```

`update: {}` is intentional. The first submission wins. If the same person re-submits a form with updated details, the outreach team handles that manually. Silently overwriting existing CRM data from a webhook is not safe.

### Layer 3 — Record-level guard

`processInboundEmail()` checks `inboundEmail.processed` before doing any work. If the function is called twice with the same ID (e.g. from a retry queue), the second call returns the existing state immediately without touching the database:

```typescript
if (inboundEmail.processed) {
  return { inboundEmail, lead: null };
}
```

---

## Service architecture

Three services, each with a distinct responsibility:

| Service | File | Does what |
|---|---|---|
| Save | `inbound-email.service.ts` | Persists raw email to InboundEmail table; no parsing |
| Parse | `lead-parser.service.ts` | Pure function — extracts fields from text, normalizes phone |
| Orchestrate | `process-inbound-email.service.ts` | Calls parse → upsert lead → mark processed; owns error strategy |

**Why split parse from orchestrate?**

The parser is pure — no database, no async, no dependencies. It can be tested exhaustively with no mocking. If it is embedded in the orchestrator, testing it requires mocking Prisma even though Prisma is irrelevant to the regex logic. Keeping them separate means 28 parser tests that run in milliseconds with zero setup.

---

## Phone normalization

The parser accepts several US phone formats and normalizes all of them to E.164:

| Input format | Output |
|---|---|
| `555-123-4567` | `+15551234567` |
| `(555) 123-4567` | `+15551234567` |
| `555.123.4567` | `+15551234567` |
| `555 123 4567` | `+15551234567` |
| `5551234567` (bare 10-digit) | `+15551234567` |
| `1-555-123-4567` | `+15551234567` |
| `15551234567` (11-digit with 1) | `+15551234567` |
| `+15551234567` (already E.164) | `+15551234567` (pass-through) |
| `+447700900123` (international E.164) | `+447700900123` (pass-through) |

Numbers that don't produce 10 or 11 digits after stripping non-digits throw a `LeadParseError`.

---

## Error handling strategy

Two distinct failure modes with different semantics:

| Error type | Cause | `processed` | `error` field | SendGrid retry? |
|---|---|---|---|---|
| `LeadParseError` | Email body didn't match expected format | `true` | Error message | No — intentionally marked done |
| Any other error | DB failure, network issue, etc. | `false` | Error message | Yes — can be retried when the failure is resolved |

`LeadParseError` sets `processed: true` because we don't want SendGrid retrying an unparseable email indefinitely. The `error` field flags it for manual review. A transient DB failure leaves `processed: false` so the record can be reprocessed once the issue is resolved.

---

## Structured error type

```typescript
export class LeadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadParseError";
  }
}
```

`LeadParseError` is an `instanceof Error`, carries a `.message`, and has a distinct `.name` so callers can narrow the type with `err instanceof LeadParseError`. This avoids stringly-typed error checking (`err.message.includes("parse")`) which is fragile.

---

## Files changed this session

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `@@index([email])` → `@@unique([email])` on Lead |
| `packages/db/prisma/migrations/20260217_phase5_lead_email_unique/migration.sql` | New — migration SQL for the unique constraint |
| `apps/api/src/services/lead-parser.service.ts` | New — pure parsing service with `LeadParseError`, `parseLeadFromEmail`, `normalizePhone` |
| `apps/api/src/services/process-inbound-email.service.ts` | New — orchestration: parse → upsert → mark processed; idempotency guard |
| `apps/api/src/controllers/inbound-email.controller.ts` | Updated — now calls `processInboundEmail` after saving |
| `apps/api/src/__tests__/lead-parser.test.ts` | New — 28 unit tests for parser and phone normalizer |
| `README.md` | Updated test table, planned features checklist, architecture log |

---

## Test counts after this session

| File | Tests |
|---|---|
| `env.test.ts` | 45 |
| `leads-schema.test.ts` | 44 |
| `inbound-email-schema.test.ts` | 19 |
| `verify-webhook-secret.test.ts` | 7 |
| `lead-parser.test.ts` | 28 |
| **Total** | **143** |

---

## Open questions / next steps

- [ ] Outreach dispatch service — send SMS via Twilio, send email via SendGrid
- [ ] Twilio inbound SMS webhook handler (`POST /webhooks/inbound-sms`)
- [ ] Outreach status tracking and reply logging (update Lead.status, create MessageLog)
- [ ] Authentication strategy decision (API key vs JWT)
- [ ] CI pipeline (GitHub Actions — run `pnpm -w run test` on every push)
- [ ] Next.js dashboard (`apps/web`) — leads list, outreach composer, message history
