# Conversation 02 — Prisma Schema Design (Phase 2)

**Date:** 2026-02-17
**Participants:** Diane Stephani, Claude (claude-sonnet-4-5-20250929)

---

## Goal

Design and validate the Prisma schema for the CRM automation app. Replace the placeholder
`Contact`/`Outreach` models from Phase 1 with the real domain models: `Lead`, `InboundEmail`,
and `MessageLog`. Generate the SQLite database, inspect it directly, and verify the Prisma
client works end-to-end with a smoke test.

---

## The SQLite Enum Problem — Critical Constraint

**Prisma 5 does not support the `enum` keyword at all with the SQLite provider.** It's not
that enums are silently stored as TEXT — the schema validator rejects the file outright with
an error at `prisma generate` time. This was encountered in Phase 1 as well.

The requirement was "use Prisma enums properly." The resolution: Prisma enums are a
PostgreSQL-specific feature. The correct architecture for a SQLite-first, PostgreSQL-portable
codebase is:

- Store enum-like values as `String` columns in the Prisma schema
- Document the valid values in schema comments
- Enforce valid values at the application layer with Zod validation
- Type them as string literal unions in `@crm/types` — no runtime cost, full type safety

When migrating to PostgreSQL later, these `String` columns can optionally be converted to
native PostgreSQL enum types via a single Prisma migration. No application code changes are
required in either direction.

---

## Final Schema

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Lead {
  id              String    @id @default(uuid())
  name            String
  email           String
  phone           String
  // status: "NEW" | "IN_SEQUENCE" | "RESPONDED" | "BOOKED" | "CLOSED"
  status          String    @default("NEW")
  sequenceDay     Int       @default(0)
  lastContactedAt DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  messageLogs MessageLog[]

  @@index([email])
  @@index([phone])
  @@index([status])
}

model InboundEmail {
  id        String   @id @default(uuid())
  subject   String
  rawText   String
  processed Boolean  @default(false)
  error     String?
  createdAt DateTime @default(now())
}

model MessageLog {
  id        String   @id @default(uuid())
  leadId    String
  // direction: "OUTBOUND" | "INBOUND"
  direction String
  body      String
  sentAt    DateTime @default(now())

  lead Lead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([leadId])
  @@index([direction])
}
```

---

## Schema Design Decisions

### `@default(uuid())` instead of `cuid()`
UUIDs are the industry standard for primary keys exposed externally. Both are Prisma built-ins.
UUIDs are more recognizable in API responses and logs, and are universally supported by every
database and framework without library dependencies.

### Indexes

| Index | Reason |
|---|---|
| `Lead @@index([email])` | Inbound emails are matched to leads by email address — this query runs on every webhook |
| `Lead @@index([phone])` | Inbound SMS is matched by phone number — same frequency |
| `Lead @@index([status])` | Sequence runner queries "all leads with status = IN_SEQUENCE" in bulk |
| `MessageLog @@index([leadId])` | Every lead detail view loads all message history for that lead |
| `MessageLog @@index([direction])` | Filtering by OUTBOUND/INBOUND is common for reporting |

Without these, every lookup is a full table scan. At hundreds of leads this is invisible;
at tens of thousands it becomes a serious performance problem.

### `MessageLog.sentAt` uses `@default(now())`, not `@updatedAt`
Message logs are append-only records. There is no meaningful "last updated" concept —
a message sent at a point in time is immutable. `@updatedAt` would be misleading here.

### `InboundEmail` has no `leadId` relation
An inbound email arrives before we know which lead it belongs to — or whether a matching
lead exists at all. Requiring `leadId` would cause a NOT NULL constraint failure on ingestion.
The processing step (a separate background job) resolves the relationship and creates the
`MessageLog` entry. Keeping `InboundEmail` independent allows robust, fault-tolerant ingestion.

### No `email` unique constraint on `Lead`
Contacts may legitimately appear more than once in an outreach workflow (different campaigns,
re-engagement sequences). A `@unique` constraint would block that. If deduplication is needed,
it belongs in the application logic, not the database schema.

---

## Generated Migration SQL

```sql
-- packages/db/prisma/migrations/20260217_phase2_schema/migration.sql

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "sequenceDay" INTEGER NOT NULL DEFAULT 0,
    "lastContactedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "MessageLog_leadId_idx" ON "MessageLog"("leadId");
CREATE INDEX "MessageLog_direction_idx" ON "MessageLog"("direction");
```

---

## Migration Workflow — Important Notes

### `prisma migrate dev` requires an interactive TTY

Prisma 5's `migrate dev` command hard-requires a TTY and cannot be run in scripts or
non-interactive shells. This affects:
- CI pipelines
- Tool environments without a terminal
- Any scripted invocation

**Workaround for schema changes:**
```bash
# Apply schema to the database directly (dev only, no migration file created)
DATABASE_URL="file:./prisma/dev.db" pnpm --filter @crm/db db:push --accept-data-loss

# Generate the migration SQL file separately (non-interactive, safe for scripts)
DATABASE_URL="file:./prisma/dev.db" pnpm --filter @crm/db exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/YYYYMMDD_name/migration.sql
```

**For production/CI deployments** (applying existing migration files):
```bash
DATABASE_URL="..." pnpm prisma migrate deploy
```
`migrate deploy` is non-interactive and is the correct command for production.

### `migrate dev` — correct interactive usage (your terminal)
```bash
cd packages/db
DATABASE_URL="file:./prisma/dev.db" pnpm prisma migrate dev --name your-migration-name
```

---

## DATABASE_URL Path Resolution

`file:./dev.db` is resolved **relative to the schema file location**, not the working
directory when the command is run. Since the schema is at `packages/db/prisma/schema.prisma`,
the database is always created at:

```
packages/db/prisma/dev.db
```

Use an absolute path when running the Prisma client from scripts to avoid path ambiguity:

```bash
DATABASE_URL="file:$(pwd)/packages/db/prisma/dev.db" pnpm -w run db:smoke
```

The root `package.json` `db:smoke` script handles this automatically.

---

## Smoke Test Results

All 10 checks passed against the live SQLite database:

```
✓ Created Lead (UUID primary key, status defaults to "NEW")
✓ Created MessageLog (OUTBOUND)
✓ Created MessageLog (INBOUND)
✓ Created InboundEmail (no Lead relation — intentional)
✓ Read Lead with 2 message logs (include relation)
✓ Updated Lead status to RESPONDED
✓ Index lookup by email: OK
✓ Index lookup by direction: OK
✓ Cascade delete: MessageLogs removed when Lead deleted
✓ InboundEmail deleted
```

Run from repo root:
```bash
pnpm -w run db:smoke
```

---

## Portability Analysis — SQLite → PostgreSQL

| Schema feature | SQLite | PostgreSQL | Migration work |
|---|---|---|---|
| `String @id @default(uuid())` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` | None |
| `String` (non-nullable) | `TEXT NOT NULL` | `TEXT NOT NULL` | None |
| `String?` (nullable) | `TEXT` | `TEXT` | None |
| `Int @default(0)` | `INTEGER NOT NULL DEFAULT 0` | `INTEGER NOT NULL DEFAULT 0` | None |
| `Boolean @default(false)` | `BOOLEAN NOT NULL DEFAULT false` | `BOOLEAN NOT NULL DEFAULT false` | None |
| `DateTime @default(now())` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMP DEFAULT NOW()` | None — Prisma normalizes |
| `DateTime @updatedAt` | Managed by Prisma client | Managed by Prisma client | None |
| `@@index([field])` | `CREATE INDEX` | `CREATE INDEX` | None |
| `@relation(onDelete: Cascade)` | `FOREIGN KEY ... ON DELETE CASCADE` | Same | None |
| `String` enum values | `TEXT NOT NULL` | `TEXT NOT NULL` (or native enum) | Optional — add `CHECK` constraint or convert to native enum in a follow-up migration |

**No `@db.*` provider-specific annotations are used anywhere in the schema.** This was a
deliberate constraint. Annotations like `@db.VarChar(255)` or `@db.Text` bind the schema to
a specific provider. Avoiding them means the schema is valid for both SQLite and PostgreSQL
without modification beyond the `provider` line.

---

## Shared Types in `@crm/types`

String literal union types are the TypeScript equivalent of the database's string columns:

```typescript
export type LeadStatus = "NEW" | "IN_SEQUENCE" | "RESPONDED" | "BOOKED" | "CLOSED";
export type MessageDirection = "OUTBOUND" | "INBOUND";
```

These are imported wherever Zod schemas validate incoming data, giving full compile-time
type safety without requiring native database enums.

---

## Files Changed This Session

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Replaced Contact/Outreach with Lead/InboundEmail/MessageLog |
| `packages/db/prisma/migrations/20260217_phase2_schema/migration.sql` | New migration (generated via `migrate diff`) |
| `packages/db/prisma/migrations/migration_lock.toml` | Reset to sqlite provider |
| `packages/db/src/index.ts` | Re-exports updated to new model types |
| `packages/db/scripts/smoke-test.ts` | New — manual end-to-end test |
| `packages/db/package.json` | Added `tsx` dev dep, `smoke` script |
| `packages/types/src/index.ts` | Replaced with Lead/InboundEmail/MessageLog types |
| `apps/api/.env.example` | Corrected DATABASE_URL path comment |
| `package.json` (root) | Added `db:smoke` convenience script |

---

## Open Questions / Next Steps

- [ ] Build the leads API routes (`GET /leads`, `POST /leads`, `PATCH /leads/:id`, `DELETE /leads/:id`)
- [ ] Build the MessageLog read endpoint (`GET /leads/:id/messages`)
- [ ] Build the InboundEmail webhook handler (SendGrid inbound parse)
- [ ] Build the Twilio inbound SMS webhook handler
- [ ] Implement the outreach dispatch service (send SMS / send email)
- [ ] Decide on authentication strategy (API key header vs JWT)
- [ ] Add Zod schemas for request validation in the API layer
