# Conversation 03 — Unit Tests (Phase 3)

**Date:** 2026-02-17
**Participants:** Diane Stephani, Claude (claude-sonnet-4-5-20250929)

---

## Goal

Assess whether unit tests are currently needed, set up Jest, write tests for anything with real testable logic, and handle all edge cases. Update the README to reflect the testing setup.

---

## What actually needed tests

An honest audit of every source file:

| File | Logic present | Worth unit testing? |
|---|---|---|
| `apps/api/src/env.ts` | 9 Zod validation rules with branching and format checks | **Yes** |
| `apps/api/src/index.ts` | Express wiring, one-liner health handler | No — integration test later |
| `packages/db/src/index.ts` | Prisma singleton (`??` operator, env branch for log level) | No — testing framework plumbing |
| `packages/types/src/index.ts` | Pure TypeScript type definitions | No — not executable code |

Only `env.ts` had real application logic worth testing: format validation, prefix checks, default values, and custom error messages — all of which can fail silently in unexpected ways.

---

## Bug found and fixed: `DATABASE_URL` validator

The original `env.ts` used `z.string().url()` to validate `DATABASE_URL`. The WHATWG URL spec (which Zod uses) requires a hostname after the protocol. `file:./prisma/dev.db` has no hostname, so it was rejected.

**Effect:** The API server would crash immediately on startup in local development, even with a correct SQLite URL. The bug was latent — it had never been caught because the env validation was never actually tested.

**Fix:** Replaced `.url()` with a custom `.refine()` that accepts any of:
- `file:` (SQLite)
- `postgresql://` (PostgreSQL)
- `postgres://` (PostgreSQL short alias)

```typescript
const databaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL is required")
  .refine(
    (val) =>
      val.startsWith("file:") ||
      val.startsWith("postgresql://") ||
      val.startsWith("postgres://"),
    "DATABASE_URL must be a SQLite file path (file:...) or a PostgreSQL URL (postgresql://...)"
  );
```

---

## Architectural refactor: `env-schema.ts`

**The problem:** `env.ts` called `envSchema.parse(process.env)` at the top level — it runs the moment the module is imported. In Jest, there are no env vars, so any test that imported `env.ts` would fail before a single test ran.

**Attempted fix 1:** `jest.mock("../env.js")` — didn't work. `jest.requireActual()` still executed the module code.

**The correct fix:** Separate schema definition from execution into two files:

| File | Responsibility | Side effects |
|---|---|---|
| `env-schema.ts` | Defines and exports `envSchema` and `Env` type | None — safe to import anywhere |
| `env.ts` | Imports schema, calls `parse(process.env)` | Hard crash on startup if vars are invalid |

Tests import `env-schema.ts` directly. Production code imports `env.ts` as before. No behavior changes in production.

This is a cleaner separation regardless of testing — the schema definition is now a reusable pure value, not permanently tied to a side-effectful execution context.

---

## Jest setup

**Why `ts-jest` instead of `@swc/jest` or Babel?**
`ts-jest` uses the TypeScript compiler directly, so the type system is active during tests. Type errors in test files are caught. SWC/Babel strip types and skip checking — faster but blind to type mistakes.

**Why `jest.config.js` (CJS) instead of `jest.config.ts`?**
Jest requires `ts-node` to parse a `.ts` config file. Rather than add another dependency, a plain `.js` config file works without any extra tooling.

**Why override `module` and `moduleResolution` for `ts-jest`?**
The project's `tsconfig.json` uses `module: "NodeNext"` because the API runs in Node. Jest doesn't support ESM natively without additional configuration (`--experimental-vm-modules`). The `ts-jest` transform is configured to override these to `CommonJS`/`node` for the test runner only — the production build is unaffected.

**Why `moduleNameMapper` with the `.js` extension pattern?**
`NodeNext` module resolution requires explicit `.js` extensions on relative imports (`import { foo } from "./foo.js"`). Jest resolves files differently and can't find `.js` extension files (since the actual disk files are `.ts`). The mapper strips the `.js` so Jest finds the right files.

```javascript
moduleNameMapper: {
  "^(\\.{1,2}/.*)\\.js$": "$1",
}
```

---

## Test suite

**File:** `apps/api/src/__tests__/env.test.ts`
**Total tests:** 45 across 10 `describe` blocks

| `describe` block | Tests | What's covered |
|---|---|---|
| `NODE_ENV` | 5 | Valid values, default, invalid enum |
| `PORT` | 2 | String input, default value |
| `DATABASE_URL` | 8 | SQLite relative, SQLite absolute, postgresql://, postgres://, http:// rejected, plain string rejected, empty, omitted |
| `TWILIO_ACCOUNT_SID` | 5 | AC prefix, wrong prefix with error message, lowercase, empty, omitted |
| `TWILIO_AUTH_TOKEN` | 3 | Any non-empty string, empty with error message, omitted |
| `TWILIO_PHONE_NUMBER` | 7 | US E.164, international E.164, no leading +, dash format, parentheses format, empty, omitted |
| `SENDGRID_API_KEY` | 5 | SG. prefix, SK. prefix rejected, SG without dot, empty, omitted |
| `SENDGRID_FROM_EMAIL` | 7 | Valid email, subdomain, missing @, missing domain, plain word, empty, omitted |
| `SENDGRID_INBOUND_PARSE_SECRET` | 3 | Non-empty, empty, omitted |
| `multiple invalid fields` | 3 | Multiple simultaneous errors, full valid set, parsed values assertion |

### Test pattern

Each test is fully self-contained. A `validEnv` object holds a complete set of known-good values. A `parse()` helper merges overrides and calls `safeParse()`. No test reads `process.env`.

```typescript
const validEnv = { /* all valid values */ };

function parse(overrides: Record<string, string | undefined>) {
  return envSchema.safeParse({ ...validEnv, ...overrides });
}

it("rejects a number without the leading +", () => {
  const result = parse({ TWILIO_PHONE_NUMBER: "15551234567" });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues[0].message).toMatch(/E\.164/);
  }
});
```

---

## Commands

```bash
# Run all tests (from repo root)
pnpm -w run test

# Run tests directly in the api package
pnpm --filter api test

# Watch mode (re-runs on save)
pnpm --filter api test:watch

# Coverage report
pnpm --filter api test:coverage
```

---

## Files changed this session

| File | Change |
|---|---|
| `apps/api/src/env-schema.ts` | New — schema definition extracted here (no side effects) |
| `apps/api/src/env.ts` | Now just imports schema and calls parse(); exports forwarded |
| `apps/api/src/__tests__/env.test.ts` | New — 45 unit tests |
| `apps/api/jest.config.js` | New — Jest configuration with ts-jest and NodeNext overrides |
| `apps/api/package.json` | Added jest, ts-jest, @types/jest; added test scripts |
| `package.json` (root) | Added `test` convenience script |
| `README.md` | Added Testing section, updated data model, updated feature checklist |

---

## Open questions / next steps

- [ ] Leads CRUD API routes (`GET /leads`, `POST /leads`, `PATCH /leads/:id`, `DELETE /leads/:id`)
- [ ] Add Zod request body schemas for each route (these will also be unit tested)
- [ ] Outreach dispatch service — Twilio and SendGrid integration
- [ ] Webhook handlers — inbound SMS and inbound email parse
- [ ] Authentication strategy decision (API key vs JWT)
- [ ] CI pipeline with GitHub Actions (run `pnpm -w run test` on every push)
