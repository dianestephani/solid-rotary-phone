# Conversation 01 — Monorepo Setup & Database Layer

**Date:** 2026-02-17
**Participants:** Diane Stephani, Claude (claude-sonnet-4-5-20250929)

---

## Project Context

Building a portfolio-level CRM automation app that handles automated outreach to email leads via SMS (Twilio) and email (SendGrid inbound webhook).

**Stack:**
- Node.js / TypeScript / Express (API)
- PostgreSQL → SQLite for dev (Prisma ORM)
- Twilio (SMS outreach)
- SendGrid (inbound email webhook)
- Next.js (frontend, later)
- pnpm workspaces (monorepo)

---

## Session 1 — Monorepo Initialization

### Goal
Initialize a pnpm monorepo from a freshly cloned GitHub repo, set up the full directory structure, TypeScript configuration, and environment variable strategy.

### Structure created

```
solid-rotary-phone/
├── pnpm-workspace.yaml
├── package.json                  (root — private, no code)
├── tsconfig.base.json            (shared TS config, extended by all packages)
├── apps/
│   ├── api/                      (Express backend)
│   │   ├── src/index.ts          (entrypoint)
│   │   ├── src/env.ts            (Zod-validated env vars)
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                      (Next.js frontend placeholder)
│       ├── src/app/page.tsx
│       ├── src/app/layout.tsx
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
└── packages/
    ├── db/                       (Prisma — only package touching the DB)
    │   ├── prisma/schema.prisma
    │   ├── src/index.ts          (singleton PrismaClient + type re-exports)
    │   ├── package.json          (@crm/db)
    │   └── tsconfig.json
    └── types/                    (HTTP-layer shared types — no Prisma dep)
        ├── src/index.ts          (ApiResponse, request/response shapes, webhook payloads)
        ├── package.json          (@crm/types)
        └── tsconfig.json
```

### Key decisions & rationale

**`pnpm-workspace.yaml`**
Declares `apps/*` and `packages/*` as workspace packages. pnpm symlinks them into `node_modules` so they can import each other by name without being published to npm.

**Root `package.json` is `"private": true`**
Prevents accidentally running `pnpm publish` at the root. The root is never a publishable package — it's a control surface.

**`tsconfig.base.json` (not `tsconfig.json`) at root**
There's no code to compile at the root, so a `tsconfig.json` there would confuse the compiler. Each package extends the base and only overrides what it needs.

**`"module": "NodeNext"` in `api`, `"Bundler"` in `web`**
Matches the actual runtime. `api` runs directly in Node without a bundler — `NodeNext` makes `.js` extensions required in relative imports. `web` runs through webpack/turbopack — `Bundler` resolution allows bare extensions.

**`packages/db` vs `packages/types` separation**
- `@crm/db`: owns the database connection and Prisma types. The only package that imports `@prisma/client`.
- `@crm/types`: owns HTTP-layer types (API request/response shapes, webhook payloads). No Prisma dependency, so `web` can import it without pulling in a DB library.

**`workspace:*` dependency protocol**
`"@crm/db": "workspace:*"` tells pnpm to resolve this locally, never from the npm registry. The `*` is replaced with the actual version before any publish.

**Zod env validation in `src/env.ts`**
All required environment variables are validated with Zod at startup. If any are missing or malformed, the process crashes immediately with a precise error message rather than failing silently at runtime when a route tries to use them.

**Singleton PrismaClient pattern**
Stores the client on `globalThis` to survive hot reloads in development. Without it, each file save opens a new DB connection — for SQLite this risks file-locking conflicts; for PostgreSQL it exhausts the connection pool.

**`.env` per app, not at repo root**
`web` must never see `TWILIO_AUTH_TOKEN`. Keeping `.env` inside each app directory enforces this boundary.

**`tsx watch` for API dev**
Zero-config TypeScript executor. Runs `.ts` directly and restarts on file changes. Much faster than the old `ts-node` + `nodemon` approach.

---

## Session 2 — SQLite for Local Development

### Goal
Refactor the database layer to use SQLite for local development while keeping the schema fully portable for a future PostgreSQL migration.

### Changes made

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `provider` → `"sqlite"`, `enum` blocks removed, `channel`/`status` → `String` |
| `packages/db/src/index.ts` | Removed `OutreachChannel`/`OutreachStatus` re-exports (no longer Prisma enums) |
| `apps/api/.env.example` | `DATABASE_URL` → `"file:./dev.db"`, PostgreSQL format documented in comment |
| `.gitignore` | Added `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm` |
| `packages/db/prisma/migrations/` | Created — `migration.sql` committed, `dev.db` binary gitignored |

### The enum problem — important nuance

Prisma 5 with the SQLite provider **does not support the `enum` keyword in the schema at all** — not even as a TEXT-backed enum. The solution is to store enum values as `String` columns in the schema and enforce valid values at the application layer:

- **Database:** `channel TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'PENDING'`
- **Application:** Zod validates incoming values against the allowed set
- **TypeScript:** `OutreachChannel` and `OutreachStatus` union types live in `@crm/types` and are unchanged

This is actually the more portable design: the constraint lives in your application code, not in a database-specific type system.

### DATABASE_URL path convention

The path in `DATABASE_URL` is relative to the **working directory when `prisma` runs** — which is `packages/db/` when using `pnpm --filter @crm/db db:migrate`. So `"file:./dev.db"` creates the file at `packages/db/dev.db`.

### What `.gitignore` covers for SQLite

```
*.db          # the database binary
*.db-journal  # legacy rollback journal
*.db-wal      # Write-Ahead Log (WAL mode)
*.db-shm      # shared memory file for WAL
```

These auxiliary files appear during active write transactions and would represent incomplete state if committed.

### Portability analysis

| Feature | Migrates cleanly? | Notes |
|---|---|---|
| `String @id @default(cuid())` | Yes | `TEXT PRIMARY KEY` on both |
| `String @unique` | Yes | `UNIQUE INDEX` on both |
| `DateTime @default(now())` | Yes | Prisma normalizes this |
| `DateTime @updatedAt` | Yes | Managed by Prisma client, not DB |
| `@relation(onDelete: Cascade)` | Yes | Standard SQL on both |
| `channel/status String` (was enum) | Yes, with tradeoff | Stays as `TEXT`; optionally add a PostgreSQL `CHECK` constraint later |

### How to switch to PostgreSQL later

1. Update `DATABASE_URL` in your production environment to a PostgreSQL connection string
2. Change `provider = "sqlite"` to `provider = "postgresql"` in `schema.prisma`
3. Run `pnpm --filter @crm/db db:migrate --name postgres-migration`
4. Run `pnpm --filter @crm/db db:generate`
5. Zero application code changes required

---

## Running the project (current state)

```bash
# Install dependencies
pnpm install

# Generate Prisma client (must be done before building @crm/db)
pnpm --filter @crm/db db:generate

# Run initial migration (creates packages/db/dev.db)
cd packages/db && DATABASE_URL="file:./dev.db" pnpm prisma migrate dev

# Build shared packages (must be done before typechecking apps)
pnpm --filter @crm/db build
pnpm --filter @crm/types build

# Start API in dev mode
pnpm dev:api
```

### Why build order matters

`apps/api` imports from `@crm/db`. TypeScript resolves `@crm/db` by reading `packages/db/dist/index.d.ts`. That file only exists after `pnpm --filter @crm/db build` has run. This is the standard monorepo chicken-and-egg: internal packages must be built before consumers can typecheck against them.

---

## Open questions / next steps

- [ ] Build out `contacts` and `outreach` CRUD routes in `apps/api/src/`
- [ ] Wire in Twilio webhook handler with Zod validation against `TwilioSmsPayload`
- [ ] Wire in SendGrid inbound webhook handler with Zod validation against `SendGridInboundPayload`
- [ ] Decide on authentication strategy for the API (JWT vs session)
- [ ] Begin Next.js frontend work in `apps/web`
