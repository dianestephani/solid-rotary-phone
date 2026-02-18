/**
 * Unit tests for src/services/lead-parser.service.ts
 *
 * The parser is a pure function — no database, no network, no side effects.
 * Tests are fully self-contained and deterministic.
 *
 * EXPECTED EMAIL FORMAT (version 1)
 *
 *   Name: John Smith
 *   Phone: 555-123-4567
 *   Email: john@email.com
 *
 * If this format changes, update lead-parser.service.ts and add/adjust tests here.
 */
import { parseLeadFromEmail, normalizePhone, LeadParseError } from "../services/lead-parser.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBody(overrides: {
  name?: string;
  phone?: string;
  email?: string;
} = {}): string {
  const name = overrides.name ?? "John Smith";
  const phone = overrides.phone ?? "555-123-4567";
  const email = overrides.email ?? "john@email.com";
  return `Name: ${name}\nPhone: ${phone}\nEmail: ${email}`;
}

// ---------------------------------------------------------------------------
// parseLeadFromEmail — happy paths
// ---------------------------------------------------------------------------
describe("parseLeadFromEmail — valid bodies", () => {
  it("parses a standard forwarded email body", () => {
    const result = parseLeadFromEmail(makeBody());
    expect(result.name).toBe("John Smith");
    expect(result.phone).toBe("+15551234567");
    expect(result.email).toBe("john@email.com");
  });

  it("trims whitespace from extracted fields", () => {
    const body = "Name:   Jane Doe  \nPhone:  555-987-6543  \nEmail:  jane@example.com  ";
    const result = parseLeadFromEmail(body);
    expect(result.name).toBe("Jane Doe");
    expect(result.email).toBe("jane@example.com");
  });

  it("is case-insensitive for field labels", () => {
    const body = "name: John Smith\nphone: 555-123-4567\nemail: john@email.com";
    const result = parseLeadFromEmail(body);
    expect(result.name).toBe("John Smith");
  });

  it("handles fields in a different order", () => {
    const body = "Email: john@email.com\nName: John Smith\nPhone: 555-123-4567";
    const result = parseLeadFromEmail(body);
    expect(result.name).toBe("John Smith");
    expect(result.email).toBe("john@email.com");
    expect(result.phone).toBe("+15551234567");
  });

  it("handles extra lines before and after the fields", () => {
    const body = [
      "---------- Forwarded message ----------",
      "From: forwarder@company.com",
      "",
      "Name: John Smith",
      "Phone: 555-123-4567",
      "Email: john@email.com",
      "",
      "Sent from my iPhone",
    ].join("\n");
    const result = parseLeadFromEmail(body);
    expect(result.name).toBe("John Smith");
  });

  it("handles names with multiple words", () => {
    const result = parseLeadFromEmail(makeBody({ name: "Mary Jane Watson-Parker" }));
    expect(result.name).toBe("Mary Jane Watson-Parker");
  });
});

// ---------------------------------------------------------------------------
// parseLeadFromEmail — missing fields throw LeadParseError
// ---------------------------------------------------------------------------
describe("parseLeadFromEmail — missing fields", () => {
  it("throws LeadParseError when Name is missing", () => {
    const body = "Phone: 555-123-4567\nEmail: john@email.com";
    expect(() => parseLeadFromEmail(body)).toThrow(LeadParseError);
    expect(() => parseLeadFromEmail(body)).toThrow(/Name/);
  });

  it("throws LeadParseError when Phone is missing", () => {
    const body = "Name: John Smith\nEmail: john@email.com";
    expect(() => parseLeadFromEmail(body)).toThrow(LeadParseError);
    expect(() => parseLeadFromEmail(body)).toThrow(/Phone/);
  });

  it("throws LeadParseError when Email is missing", () => {
    const body = "Name: John Smith\nPhone: 555-123-4567";
    expect(() => parseLeadFromEmail(body)).toThrow(LeadParseError);
    expect(() => parseLeadFromEmail(body)).toThrow(/Email/);
  });

  it("throws LeadParseError on a completely empty body", () => {
    expect(() => parseLeadFromEmail("")).toThrow(LeadParseError);
  });
});

// ---------------------------------------------------------------------------
// normalizePhone — US local numbers
// ---------------------------------------------------------------------------
describe("normalizePhone — US local (10-digit)", () => {
  it("normalizes dash-separated US number", () => {
    expect(normalizePhone("555-123-4567")).toBe("+15551234567");
  });

  it("normalizes dot-separated US number", () => {
    expect(normalizePhone("555.123.4567")).toBe("+15551234567");
  });

  it("normalizes US number with spaces", () => {
    expect(normalizePhone("555 123 4567")).toBe("+15551234567");
  });

  it("normalizes US number with parentheses", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
  });

  it("normalizes bare 10-digit string", () => {
    expect(normalizePhone("5551234567")).toBe("+15551234567");
  });
});

// ---------------------------------------------------------------------------
// normalizePhone — US with country code
// ---------------------------------------------------------------------------
describe("normalizePhone — US with country code (11-digit)", () => {
  it("normalizes 11-digit US number starting with 1", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
  });

  it("normalizes 1-dash-separated US number with country code", () => {
    expect(normalizePhone("1-555-123-4567")).toBe("+15551234567");
  });
});

// ---------------------------------------------------------------------------
// normalizePhone — already E.164
// ---------------------------------------------------------------------------
describe("normalizePhone — already E.164 (pass-through)", () => {
  it("passes through a US E.164 number unchanged", () => {
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });

  it("passes through an international E.164 number unchanged", () => {
    expect(normalizePhone("+447700900123")).toBe("+447700900123");
  });

  it("passes through a short E.164 number (7-digit country)", () => {
    expect(normalizePhone("+1234567")).toBe("+1234567");
  });
});

// ---------------------------------------------------------------------------
// normalizePhone — invalid inputs throw LeadParseError
// ---------------------------------------------------------------------------
describe("normalizePhone — invalid inputs", () => {
  it("throws LeadParseError for a 9-digit number (too short for US)", () => {
    expect(() => normalizePhone("555123456")).toThrow(LeadParseError);
  });

  it("throws LeadParseError for a 12-digit number not starting with a +", () => {
    // 12 digits with no leading +: doesn't match US 10 or 11-digit pattern
    expect(() => normalizePhone("555123456789")).toThrow(LeadParseError);
  });

  it("throws LeadParseError for an empty string", () => {
    expect(() => normalizePhone("")).toThrow(LeadParseError);
  });

  it("throws LeadParseError for a non-numeric string", () => {
    expect(() => normalizePhone("not-a-phone")).toThrow(LeadParseError);
  });

  it("throws LeadParseError for letters mixed with digits", () => {
    expect(() => normalizePhone("555-ABC-4567")).toThrow(LeadParseError);
  });
});

// ---------------------------------------------------------------------------
// LeadParseError identity
// ---------------------------------------------------------------------------
describe("LeadParseError", () => {
  it("is an instance of Error", () => {
    const err = new LeadParseError("test");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name 'LeadParseError'", () => {
    const err = new LeadParseError("test");
    expect(err.name).toBe("LeadParseError");
  });

  it("carries the message", () => {
    const err = new LeadParseError("could not parse phone");
    expect(err.message).toBe("could not parse phone");
  });
});
