/**
 * Unit tests for src/schemas/inbound-email.ts
 *
 * The schema validates the SendGrid Inbound Parse webhook payload.
 * Tests are fully self-contained — no Express, no database, no network.
 */
import { inboundEmailSchema } from "../schemas/inbound-email.js";

// A complete, valid payload matching what SendGrid sends
const validPayload = {
  from: "sender@example.com",
  to: "inbound@parse.yourdomain.com",
  subject: "Test email",
  text: "Hello from the test",
  envelope: JSON.stringify({ from: "sender@example.com", to: ["inbound@parse.yourdomain.com"] }),
};

// ---------------------------------------------------------------------------
// from
// ---------------------------------------------------------------------------
describe("from", () => {
  it("accepts a plain email address", () => {
    const result = inboundEmailSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.from).toBe("sender@example.com");
  });

  it("accepts a 'Name <email>' format (as SendGrid sends it)", () => {
    const result = inboundEmailSchema.safeParse({
      ...validPayload,
      from: "Jane Smith <jane@example.com>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = inboundEmailSchema.safeParse({ ...validPayload, from: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/required/);
  });

  it("rejects when omitted", () => {
    const { from: _from, ...rest } = validPayload;
    const result = inboundEmailSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// to
// ---------------------------------------------------------------------------
describe("to", () => {
  it("accepts a valid recipient address", () => {
    const result = inboundEmailSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = inboundEmailSchema.safeParse({ ...validPayload, to: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/required/);
  });

  it("rejects when omitted", () => {
    const { to: _to, ...rest } = validPayload;
    const result = inboundEmailSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subject
// ---------------------------------------------------------------------------
describe("subject", () => {
  it("accepts a non-empty subject", () => {
    const result = inboundEmailSchema.safeParse({ ...validPayload, subject: "Re: Follow up" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subject).toBe("Re: Follow up");
  });

  it("defaults to empty string when omitted", () => {
    const { subject: _subject, ...rest } = validPayload;
    const result = inboundEmailSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subject).toBe("");
  });

  it("accepts an empty string (subject field present but blank)", () => {
    const result = inboundEmailSchema.safeParse({ ...validPayload, subject: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subject).toBe("");
  });
});

// ---------------------------------------------------------------------------
// text / html body content
// ---------------------------------------------------------------------------
describe("body content (text / html)", () => {
  it("accepts a payload with text only", () => {
    const result = inboundEmailSchema.safeParse({
      ...validPayload,
      text: "Plain text body",
      html: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload with html only", () => {
    const result = inboundEmailSchema.safeParse({
      ...validPayload,
      text: undefined,
      html: "<p>HTML body</p>",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload with both text and html", () => {
    const result = inboundEmailSchema.safeParse({
      ...validPayload,
      text: "Plain text",
      html: "<p>HTML</p>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with neither text nor html", () => {
    const { text: _text, ...rest } = validPayload;
    const result = inboundEmailSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one of text or html/);
    }
  });

  it("rejects a payload where both text and html are empty strings", () => {
    const result = inboundEmailSchema.safeParse({
      ...validPayload,
      text: "",
      html: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one of text or html/);
    }
  });
});

// ---------------------------------------------------------------------------
// envelope
// ---------------------------------------------------------------------------
describe("envelope", () => {
  it("accepts a valid JSON envelope string", () => {
    const result = inboundEmailSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects an empty envelope", () => {
    const result = inboundEmailSchema.safeParse({ ...validPayload, envelope: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/required/);
  });

  it("rejects when omitted", () => {
    const { envelope: _envelope, ...rest } = validPayload;
    const result = inboundEmailSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full valid payload
// ---------------------------------------------------------------------------
describe("full valid payload", () => {
  it("parses and returns all expected fields", () => {
    const result = inboundEmailSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBe("sender@example.com");
      expect(result.data.to).toBe("inbound@parse.yourdomain.com");
      expect(result.data.subject).toBe("Test email");
      expect(result.data.text).toBe("Hello from the test");
      expect(result.data.envelope).toBeTruthy();
    }
  });
});
