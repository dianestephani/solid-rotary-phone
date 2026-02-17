/**
 * Unit tests for the Zod schemas in src/schemas/leads.ts
 *
 * These tests exercise the schema definitions directly — no Express, no database,
 * no network. Each test is self-contained and deterministic.
 */
import { createLeadSchema, updateLeadSchema } from "../schemas/leads.js";

// A complete, valid create payload
const validCreate = {
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "+15551234567",
};

// A complete, valid update payload
const validUpdate = {
  name: "Jane Smith Updated",
  email: "jane.updated@example.com",
  phone: "+14157654321",
  status: "IN_SEQUENCE" as const,
  sequenceDay: 3,
  lastContactedAt: "2026-02-17T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// createLeadSchema
// ---------------------------------------------------------------------------
describe("createLeadSchema", () => {
  // name -------------------------------------------------------------------
  describe("name", () => {
    it("accepts a non-empty string", () => {
      const result = createLeadSchema.safeParse(validCreate);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).toBe("Jane Smith");
    });

    it("rejects an empty string", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, name: "" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/required/);
    });

    it("rejects when omitted", () => {
      const { name: _name, ...rest } = validCreate;
      const result = createLeadSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // email ------------------------------------------------------------------
  describe("email", () => {
    it("accepts a valid email", () => {
      const result = createLeadSchema.safeParse(validCreate);
      expect(result.success).toBe(true);
    });

    it("accepts an email with subdomain", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, email: "user@mail.co.uk" });
      expect(result.success).toBe(true);
    });

    it("rejects an email missing the @", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, email: "notanemail" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/valid email/);
    });

    it("rejects an email missing the domain", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, email: "user@" });
      expect(result.success).toBe(false);
    });

    it("rejects an empty string", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, email: "" });
      expect(result.success).toBe(false);
    });

    it("rejects when omitted", () => {
      const { email: _email, ...rest } = validCreate;
      const result = createLeadSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // phone ------------------------------------------------------------------
  describe("phone", () => {
    it("accepts a US number in E.164 format", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, phone: "+15551234567" });
      expect(result.success).toBe(true);
    });

    it("accepts an international number in E.164 format", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, phone: "+447700900123" });
      expect(result.success).toBe(true);
    });

    it("rejects a number without the leading +", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, phone: "15551234567" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/E\.164/);
    });

    it("rejects a number with dashes", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, phone: "555-123-4567" });
      expect(result.success).toBe(false);
    });

    it("rejects a number that is too short (fewer than 7 digits after +)", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, phone: "+123456" });
      expect(result.success).toBe(false);
    });

    it("rejects an empty string", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, phone: "" });
      expect(result.success).toBe(false);
    });

    it("rejects when omitted", () => {
      const { phone: _phone, ...rest } = validCreate;
      const result = createLeadSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // status -----------------------------------------------------------------
  describe("status", () => {
    const validStatuses = ["NEW", "IN_SEQUENCE", "RESPONDED", "BOOKED", "CLOSED"] as const;

    it.each(validStatuses)("accepts status '%s'", (status) => {
      const result = createLeadSchema.safeParse({ ...validCreate, status });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe(status);
    });

    it("is optional — omitting it produces undefined", () => {
      const result = createLeadSchema.safeParse(validCreate);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBeUndefined();
    });

    it("rejects an invalid status value", () => {
      const result = createLeadSchema.safeParse({ ...validCreate, status: "PENDING" });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// updateLeadSchema
// ---------------------------------------------------------------------------
describe("updateLeadSchema", () => {
  // All-valid full update --------------------------------------------------
  it("accepts a full valid update payload", () => {
    const result = updateLeadSchema.safeParse(validUpdate);
    expect(result.success).toBe(true);
  });

  // name -------------------------------------------------------------------
  describe("name", () => {
    it("accepts a non-empty string", () => {
      const result = updateLeadSchema.safeParse({ name: "New Name" });
      expect(result.success).toBe(true);
    });

    it("rejects an empty string", () => {
      const result = updateLeadSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/empty/);
    });
  });

  // email ------------------------------------------------------------------
  describe("email", () => {
    it("accepts a valid email", () => {
      const result = updateLeadSchema.safeParse({ email: "test@example.com" });
      expect(result.success).toBe(true);
    });

    it("rejects an invalid email", () => {
      const result = updateLeadSchema.safeParse({ email: "not-an-email" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/valid email/);
    });
  });

  // phone ------------------------------------------------------------------
  describe("phone", () => {
    it("accepts a valid E.164 number", () => {
      const result = updateLeadSchema.safeParse({ phone: "+14155552671" });
      expect(result.success).toBe(true);
    });

    it("rejects a non-E.164 phone number", () => {
      const result = updateLeadSchema.safeParse({ phone: "555-1234" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/E\.164/);
    });
  });

  // status -----------------------------------------------------------------
  describe("status", () => {
    const validStatuses = ["NEW", "IN_SEQUENCE", "RESPONDED", "BOOKED", "CLOSED"] as const;

    it.each(validStatuses)("accepts status '%s'", (status) => {
      const result = updateLeadSchema.safeParse({ status });
      expect(result.success).toBe(true);
    });

    it("rejects an invalid status", () => {
      const result = updateLeadSchema.safeParse({ status: "UNKNOWN" });
      expect(result.success).toBe(false);
    });
  });

  // sequenceDay ------------------------------------------------------------
  describe("sequenceDay", () => {
    it("accepts zero", () => {
      const result = updateLeadSchema.safeParse({ sequenceDay: 0 });
      expect(result.success).toBe(true);
    });

    it("accepts a positive integer", () => {
      const result = updateLeadSchema.safeParse({ sequenceDay: 5 });
      expect(result.success).toBe(true);
    });

    it("rejects a negative integer", () => {
      const result = updateLeadSchema.safeParse({ sequenceDay: -1 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/non-negative/);
    });

    it("rejects a float", () => {
      const result = updateLeadSchema.safeParse({ sequenceDay: 1.5 });
      expect(result.success).toBe(false);
    });
  });

  // lastContactedAt --------------------------------------------------------
  describe("lastContactedAt", () => {
    it("accepts a valid ISO 8601 datetime string", () => {
      const result = updateLeadSchema.safeParse({
        lastContactedAt: "2026-02-17T12:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a plain date without time", () => {
      const result = updateLeadSchema.safeParse({ lastContactedAt: "2026-02-17" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/ISO 8601/);
    });

    it("rejects a non-date string", () => {
      const result = updateLeadSchema.safeParse({ lastContactedAt: "not-a-date" });
      expect(result.success).toBe(false);
    });
  });

  // empty body guard -------------------------------------------------------
  describe("empty body guard", () => {
    it("rejects an empty object", () => {
      const result = updateLeadSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/at least one field/);
    });
  });
});
