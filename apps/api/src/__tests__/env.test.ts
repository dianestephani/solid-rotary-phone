/**
 * Unit tests for the envSchema defined in src/env-schema.ts
 *
 * We import from env-schema.ts directly — that file contains only the Zod
 * schema definition with zero side effects. The parse(process.env) call lives
 * in env.ts and is never touched by these tests.
 *
 * Each test uses envSchema.safeParse() with a controlled input object so tests
 * are fully isolated from process.env and from each other.
 */
import { envSchema } from "../env-schema.js";

// A complete, valid set of environment variables. Individual tests override
// specific fields to exercise edge cases.
const validEnv = {
  NODE_ENV: "development",
  PORT: "3001",
  DATABASE_URL: "file:./prisma/dev.db",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "some_auth_token",
  TWILIO_PHONE_NUMBER: "+15551234567",
  SENDGRID_API_KEY: "SG.xxxxxxxxxxxxxxxxxxxx",
  SENDGRID_FROM_EMAIL: "outreach@example.com",
  SENDGRID_INBOUND_PARSE_SECRET: "some_secret",
};

// Helper: merge overrides into validEnv and parse
function parse(overrides: Record<string, string | undefined>) {
  return envSchema.safeParse({ ...validEnv, ...overrides });
}

// ---------------------------------------------------------------------------
// NODE_ENV
// ---------------------------------------------------------------------------
describe("NODE_ENV", () => {
  it("accepts 'development'", () => {
    const result = parse({ NODE_ENV: "development" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("development");
  });

  it("accepts 'test'", () => {
    const result = parse({ NODE_ENV: "test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("test");
  });

  it("accepts 'production'", () => {
    const result = parse({ NODE_ENV: "production" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("production");
  });

  it("defaults to 'development' when omitted", () => {
    const result = parse({ NODE_ENV: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("development");
  });

  it("rejects an invalid value", () => {
    const result = parse({ NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PORT
// ---------------------------------------------------------------------------
describe("PORT", () => {
  it("accepts a numeric string", () => {
    const result = parse({ PORT: "4000" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe("4000");
  });

  it("defaults to '3001' when omitted", () => {
    const result = parse({ PORT: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe("3001");
  });
});

// ---------------------------------------------------------------------------
// DATABASE_URL
// ---------------------------------------------------------------------------
describe("DATABASE_URL", () => {
  it("accepts a SQLite file: path (relative)", () => {
    const result = parse({ DATABASE_URL: "file:./prisma/dev.db" });
    expect(result.success).toBe(true);
  });

  it("accepts a SQLite file: path (absolute)", () => {
    const result = parse({ DATABASE_URL: "file:/absolute/path/to/dev.db" });
    expect(result.success).toBe(true);
  });

  it("accepts a postgresql:// URL", () => {
    const result = parse({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a postgres:// URL (alias)", () => {
    const result = parse({
      DATABASE_URL: "postgres://user:pass@localhost:5432/mydb",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an http:// URL", () => {
    const result = parse({ DATABASE_URL: "http://example.com/db" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/SQLite file path.*PostgreSQL URL/);
    }
  });

  it("rejects a plain string with no protocol", () => {
    const result = parse({ DATABASE_URL: "just-a-string" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = parse({ DATABASE_URL: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ DATABASE_URL: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TWILIO_ACCOUNT_SID
// ---------------------------------------------------------------------------
describe("TWILIO_ACCOUNT_SID", () => {
  it("accepts a value starting with AC", () => {
    const result = parse({ TWILIO_ACCOUNT_SID: "ACtest" });
    expect(result.success).toBe(true);
  });

  it("rejects a value not starting with AC", () => {
    const result = parse({ TWILIO_ACCOUNT_SID: "ABabcdef1234567890" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/must start with AC/);
    }
  });

  it("rejects an empty string", () => {
    const result = parse({ TWILIO_ACCOUNT_SID: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ TWILIO_ACCOUNT_SID: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TWILIO_AUTH_TOKEN
// ---------------------------------------------------------------------------
describe("TWILIO_AUTH_TOKEN", () => {
  it("accepts any non-empty string", () => {
    const result = parse({ TWILIO_AUTH_TOKEN: "abc123xyz" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = parse({ TWILIO_AUTH_TOKEN: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ TWILIO_AUTH_TOKEN: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TWILIO_PHONE_NUMBER
// ---------------------------------------------------------------------------
describe("TWILIO_PHONE_NUMBER", () => {
  it("accepts a US number in E.164 format", () => {
    const result = parse({ TWILIO_PHONE_NUMBER: "+15551234567" });
    expect(result.success).toBe(true);
  });

  it("accepts an international number in E.164 format", () => {
    const result = parse({ TWILIO_PHONE_NUMBER: "+447700900123" });
    expect(result.success).toBe(true);
  });

  it("rejects a number without the leading +", () => {
    const result = parse({ TWILIO_PHONE_NUMBER: "15551234567" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/E\.164/);
    }
  });

  it("rejects a number with dashes instead of E.164", () => {
    const result = parse({ TWILIO_PHONE_NUMBER: "555-123-4567" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = parse({ TWILIO_PHONE_NUMBER: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ TWILIO_PHONE_NUMBER: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SENDGRID_API_KEY
// ---------------------------------------------------------------------------
describe("SENDGRID_API_KEY", () => {
  it("accepts a key starting with SG.", () => {
    const result = parse({ SENDGRID_API_KEY: "SG.somekey123" });
    expect(result.success).toBe(true);
  });

  it("rejects a key not starting with SG.", () => {
    const result = parse({ SENDGRID_API_KEY: "SK.somekey123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/must start with SG\./);
    }
  });

  it("rejects 'SG' without the dot", () => {
    const result = parse({ SENDGRID_API_KEY: "SGsomekey123" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = parse({ SENDGRID_API_KEY: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ SENDGRID_API_KEY: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SENDGRID_FROM_EMAIL
// ---------------------------------------------------------------------------
describe("SENDGRID_FROM_EMAIL", () => {
  it("accepts a valid email", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: "outreach@company.com" });
    expect(result.success).toBe(true);
  });

  it("accepts an email with subdomain", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: "noreply@mail.company.io" });
    expect(result.success).toBe(true);
  });

  it("rejects an email missing the @", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: "notanemail.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/valid email/);
    }
  });

  it("rejects an email missing the domain", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: "user@" });
    expect(result.success).toBe(false);
  });

  it("rejects a plain string", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: "hello" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ SENDGRID_FROM_EMAIL: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SENDGRID_INBOUND_PARSE_SECRET
// ---------------------------------------------------------------------------
describe("SENDGRID_INBOUND_PARSE_SECRET", () => {
  it("accepts any non-empty string", () => {
    const result = parse({ SENDGRID_INBOUND_PARSE_SECRET: "super_secret_value" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = parse({ SENDGRID_INBOUND_PARSE_SECRET: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when omitted", () => {
    const result = parse({ SENDGRID_INBOUND_PARSE_SECRET: undefined });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiple missing fields simultaneously
// ---------------------------------------------------------------------------
describe("multiple invalid fields", () => {
  it("reports all validation errors when several fields are invalid", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "staging",          // invalid enum value
      DATABASE_URL: "http://bad",   // wrong protocol
      TWILIO_ACCOUNT_SID: "wrong",  // missing AC prefix
      TWILIO_PHONE_NUMBER: "555",   // missing + prefix
      SENDGRID_API_KEY: "bad",      // missing SG. prefix
      SENDGRID_FROM_EMAIL: "not-an-email",
      // PORT, TWILIO_AUTH_TOKEN, SENDGRID_INBOUND_PARSE_SECRET omitted
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have multiple issues, not just the first one
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
  });

  it("passes with all required fields present and valid", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });
});
