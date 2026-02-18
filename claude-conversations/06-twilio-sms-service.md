# Conversation 06 — Twilio SMS Service (Phase 6)

**Date:** 2026-02-17
**Participants:** Diane Stephani, Claude (claude-sonnet-4-5-20250929)

---

## Goal

Create a Twilio SMS integration with a clean service wrapper, outbound message logging to `MessageLog`, typed error handling, and a full unit test suite — all without touching real Twilio credentials during tests.

---

## New folder: `lib/`

Phase 6 introduced `apps/api/src/lib/` to hold configured third-party adapters — infrastructure objects that wrap external SDKs with no business logic of their own.

| Layer | Folder | Responsibility |
|---|---|---|
| Infrastructure | `src/lib/` | SDK adapters: configured, ready-to-use client objects |
| Business logic | `src/services/` | Functions that use lib adapters to do real work |

`lib/twilio.ts` holds the client. `services/sms.service.ts` holds the logic. Neither knows the other's internals.

---

## Why wrap Twilio in a service?

Calling the Twilio SDK directly inside a route handler creates four problems:

1. **Testability** — You cannot unit test a route that directly calls Twilio without hitting the real API (slow, costs money, requires credentials) or using a complex HTTP interceptor. A service can be mocked with `jest.mock()` in one line.

2. **Single responsibility** — A route handler should translate HTTP into a function call and back. Credential management, SDK initialization, and `MessageLog` writes are not HTTP concerns.

3. **Reusability** — `sendSms()` can be called from a scheduled job, a CLI script, or a queue worker without any Express context. If it lived in a route handler it would be unreachable from non-HTTP callers.

4. **Error normalization** — Twilio throws its own error types. Wrapping them in `SmsSendError` gives the rest of the application a consistent error type to handle, independent of what the Twilio SDK does internally.

---

## Lazy singleton pattern (`lib/twilio.ts`)

The Twilio constructor reads credentials from its arguments at construction time. Constructing the client at module load time would cause any import of the file in Jest to immediately read env vars that don't exist in the test environment.

By deferring construction to the first call, test files that mock the module with `jest.mock("../lib/twilio.js")` never trigger the constructor, and the real client is only built when production code actually needs it.

**Why not construct per call?**
The Twilio SDK maintains an internal HTTP connection pool. Constructing a new client on every `sendSms()` call would create a new pool each time. One instance per process is correct usage.

---

## Send-then-log ordering

`sendSms()` sends via Twilio first, then writes to `MessageLog`. The alternative (log first, mark failed on error) would leave orphan `MessageLog` rows for messages that were never sent. A missed log entry for a message that was sent is easier to recover from (Twilio's dashboard shows it) than a misleading log entry for a message that was never sent.

---

## `SmsSendError`

A typed error class extending `Error` with a stable `.name` property. Callers can use `instanceof SmsSendError` to distinguish Twilio failures from DB errors or unexpected runtime exceptions without depending on error message strings.

```typescript
export class SmsSendError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SmsSendError";
  }
}
```

The `.cause` field carries the original error for logging and debugging.

---

## Unit testing: stable mock references across calls

The biggest challenge in this session was ensuring that the `messages.create` mock function captured in `beforeEach` is the same reference that `sendSms()` receives internally when it calls `getTwilioClient()`.

**The problem:** If the mock factory creates a new object on every call —

```typescript
jest.mock("../lib/twilio.js", () => ({
  getTwilioClient: jest.fn(() => ({
    messages: { create: jest.fn() },  // new fn every call
  })),
}));
```

— then `mockMessagesCreate` captured from one call and the `messages.create` fn received inside `sendSms()` from a second call are different function instances. Assertions like `toHaveBeenCalledTimes(1)` will always report 0.

**The fix:** Tell `getTwilioClient` to `mockReturnValue` a stable object in `beforeEach`:

```typescript
beforeEach(() => {
  jest.clearAllMocks();

  mockMessagesCreate = jest.fn();
  (getTwilioClient as jest.Mock).mockReturnValue({
    messages: { create: mockMessagesCreate },
  });

  mockMessagesCreate.mockResolvedValue({ sid: TWILIO_SID });
  mockMessageLogCreate.mockResolvedValue(FAKE_MESSAGE_LOG);
});
```

Every call to `getTwilioClient()` — whether from the test setup or inside `sendSms()` — now returns the same client object with the same `mockMessagesCreate` function.

**Why `jest.clearAllMocks()` doesn't clear factory-based implementations:**
`jest.clearAllMocks()` resets call history and instances but does NOT clear implementations. However, a factory-based implementation (`jest.fn(() => {...})`) creates a new object on every invocation, so clearing call history doesn't help — the object identity problem is structural. `mockReturnValue` is the correct fix because it pins the return value to a specific object.

---

## Files created this session

| File | Change |
|---|---|
| `apps/api/src/lib/twilio.ts` | New — lazy Twilio client singleton with `getTwilioClient()` |
| `apps/api/src/services/sms.service.ts` | New — `sendSms()`, `SmsSendError`, `SendSmsResult` interface |
| `apps/api/src/__tests__/sms.service.test.ts` | New — 18 tests covering success, Twilio failure, DB failure, error identity |

---

## Test counts after this session

| File | Tests |
|---|---|
| `env.test.ts` | 45 |
| `leads-schema.test.ts` | 44 |
| `inbound-email-schema.test.ts` | 19 |
| `verify-webhook-secret.test.ts` | 7 |
| `lead-parser.test.ts` | 28 |
| `sms.service.test.ts` | 18 |
| **Total** | **161** |

---

## Open questions / next steps

- [ ] Twilio inbound SMS webhook handler (`POST /webhooks/inbound-sms`)
- [ ] Outreach dispatch — trigger `sendSms()` from a route or job
- [ ] Outreach status tracking and reply logging (update `Lead.status`, create `MessageLog`)
- [ ] Authentication strategy decision (API key vs JWT)
- [ ] CI pipeline (GitHub Actions — run `pnpm -w run test` on every push)
- [ ] Next.js dashboard (`apps/web`) — leads list, outreach composer, message history
