# CRM Automation

Automated outreach for email leads — send and track SMS and email campaigns from a single platform, with full inbound reply handling via Twilio and SendGrid.

---

## What this is

A portfolio-level CRM automation backend built to demonstrate production-grade Node.js architecture. The core loop is:

1. **Ingest leads** — contacts are stored with email, name, and phone
2. **Send outreach** — trigger SMS (Twilio) or email (SendGrid) campaigns per contact
3. **Track status** — every outreach is recorded with channel, status, and timestamps
4. **Handle replies** — inbound SMS and email webhooks update outreach records and log responses

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20+ | |
| Language | TypeScript 5 | Strict mode throughout |
| API framework | Express 4 | REST, no magic |
| ORM | Prisma 5 | Schema-first, type-safe queries |
| Database | SQLite (dev) / PostgreSQL (prod) | Single `DATABASE_URL` swap to migrate |
| SMS | Twilio | Outbound SMS + inbound webhook |
| Email | SendGrid | Outbound email + inbound parse webhook |
| Validation | Zod | Request bodies, webhook payloads, env vars |
| Frontend | Next.js 14 | App Router — in progress |
| Package manager | pnpm 7+ | Workspaces monorepo |

---

## Monorepo structure

```text
solid-rotary-phone/
├── apps/
│   ├── api/          Express backend — routes, webhooks, service integrations
│   └── web/          Next.js frontend — dashboard UI (in progress)
├── packages/
│   ├── db/           Prisma schema, migrations, singleton client (@crm/db)
│   └── types/        Shared TypeScript types — API shapes, webhook payloads (@crm/types)
├── claude-conversations/   Architecture decision log
├── pnpm-workspace.yaml
└── tsconfig.base.json      Root TS config extended by all packages
```

`apps/api` and `apps/web` import from `@crm/db` and `@crm/types` via pnpm workspace links — no publishing to npm required.

---

## Data model

```text
Contact
  id          cuid (PK)
  email       unique
  name        optional
  phone       optional
  createdAt
  updatedAt

Outreach
  id          cuid (PK)
  contactId   FK → Contact (cascade delete)
  channel     "EMAIL" | "SMS"
  status      "PENDING" | "SENT" | "FAILED" | "REPLIED"
  subject     optional (email only)
  body
  sentAt      nullable — set when actually delivered
  createdAt
  updatedAt
```

---

## Local development setup

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)

No database server required — SQLite runs as a local file.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and fill in your Twilio and SendGrid credentials. The `DATABASE_URL` is pre-configured for SQLite and requires no changes for local development.

### 3. Set up the database

```bash
# Run migrations (creates packages/db/dev.db)
cd packages/db && DATABASE_URL="file:./dev.db" pnpm prisma migrate dev

# Return to repo root
cd ../..
```

### 4. Build shared packages

Internal packages must be compiled before the API can import their types:

```bash
pnpm --filter @crm/db build
pnpm --filter @crm/types build
```

### 5. Start the API

```bash
pnpm dev:api
```

The API starts at `http://localhost:3001`. Confirm it's running:

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

---

## Environment variables

All variables are validated at startup via Zod. The server will not start if any required value is missing or malformed.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default: 3001) | Port the Express server listens on |
| `NODE_ENV` | No (default: development) | `development`, `test`, or `production` |
| `DATABASE_URL` | Yes | SQLite: `file:./dev.db` — PostgreSQL: `postgresql://...` |
| `TWILIO_ACCOUNT_SID` | Yes | Starts with `AC` |
| `TWILIO_AUTH_TOKEN` | Yes | From Twilio console |
| `TWILIO_PHONE_NUMBER` | Yes | E.164 format, e.g. `+15551234567` |
| `SENDGRID_API_KEY` | Yes | Starts with `SG.` |
| `SENDGRID_FROM_EMAIL` | Yes | Verified sender address |
| `SENDGRID_INBOUND_PARSE_SECRET` | Yes | Webhook verification secret |

See [`apps/api/.env.example`](apps/api/.env.example) for the full template.

---

## Switching to PostgreSQL

The schema is designed to be database-agnostic. To move from SQLite to PostgreSQL:

1. Provision a PostgreSQL database and get a connection string
2. Set `DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE` in your environment
3. Change `provider = "sqlite"` to `provider = "postgresql"` in [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma)
4. Run `cd packages/db && pnpm prisma migrate dev --name postgres-init`
5. Run `pnpm --filter @crm/db db:generate`

No application code changes required.

---

## Planned features

- [x] Monorepo scaffold with pnpm workspaces
- [x] Prisma schema — Contact + Outreach models
- [x] SQLite for local development, PostgreSQL-portable schema
- [x] Zod-validated environment variables
- [ ] Contacts CRUD API (`GET`, `POST`, `PATCH`, `DELETE /contacts`)
- [ ] Outreach dispatch — send SMS via Twilio, email via SendGrid
- [ ] Twilio inbound SMS webhook handler
- [ ] SendGrid inbound parse webhook handler
- [ ] Outreach status tracking and reply logging
- [ ] Authentication (API key or JWT — TBD)
- [ ] Next.js dashboard — contacts list, outreach composer, status table
- [ ] CI pipeline (GitHub Actions)
- [ ] Production deployment (Railway or Fly.io — TBD)

---

## Architecture decision log

Design decisions, tradeoffs, and workflow notes are documented in [`claude-conversations/`](claude-conversations/). Each file corresponds to a session or topic.

| File | Topic |
|---|---|
| [`01-monorepo-setup.md`](claude-conversations/01-monorepo-setup.md) | Monorepo initialization, TypeScript config, SQLite setup, shared types |
