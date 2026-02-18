/**
 * Unit tests for src/services/sms.service.ts
 *
 * Both external dependencies are mocked at the module level:
 *   - ../lib/twilio.js   → getTwilioClient() returns a fake client object
 *   - @crm/db            → prisma.messageLog.create() is a jest.fn()
 *
 * This means no real Twilio API calls are made and no database is touched.
 * Tests run in milliseconds and work with no credentials configured.
 *
 * WHY jest.mock FACTORIES INSTEAD OF OUTER VARIABLES?
 * jest.mock() is hoisted to the top of the file before any variable
 * declarations. Referencing a `const mockFn = jest.fn()` declared below
 * the mock call causes a ReferenceError (temporal dead zone). The pattern
 * used here creates jest.fn() inside the factory so no outer variable is
 * referenced during hoisting. We then access the mocks via the imported
 * module object.
 */
import { sendSms, SmsSendError } from "../services/sms.service.js";
import { getTwilioClient } from "../lib/twilio.js";
import { prisma } from "@crm/db";

// ---------------------------------------------------------------------------
// Mock: Twilio client
// ---------------------------------------------------------------------------
jest.mock("../lib/twilio.js", () => ({
  getTwilioClient: jest.fn(() => ({
    messages: {
      create: jest.fn(),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock: Prisma
// ---------------------------------------------------------------------------
jest.mock("@crm/db", () => ({
  prisma: {
    messageLog: {
      create: jest.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Typed references to the mock functions
// These are set once in beforeEach after jest.mock has run.
// ---------------------------------------------------------------------------
let mockMessagesCreate: jest.Mock;
let mockMessageLogCreate: jest.Mock;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const LEAD_ID = "lead-uuid-001";
const TO = "+15551234567";
const BODY = "Hi there, following up on your inquiry.";
const TWILIO_SID = "SM1234567890abcdef";

const FAKE_MESSAGE_LOG = {
  id: "log-uuid-001",
  leadId: LEAD_ID,
  direction: "OUTBOUND",
  body: BODY,
  sentAt: new Date("2026-02-17T12:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_PHONE_NUMBER = "+18005550000";

  // Create a fresh stable fn for this test and tell getTwilioClient to always
  // return the same client object. This ensures the messages.create fn that
  // sendSms() receives internally is the same reference we assert against here.
  mockMessagesCreate = jest.fn();
  (getTwilioClient as jest.Mock).mockReturnValue({
    messages: { create: mockMessagesCreate },
  });
  mockMessageLogCreate = prisma.messageLog.create as jest.Mock;

  // Default: Twilio succeeds
  mockMessagesCreate.mockResolvedValue({ sid: TWILIO_SID });
  // Default: DB write succeeds
  mockMessageLogCreate.mockResolvedValue(FAKE_MESSAGE_LOG);
});

afterEach(() => {
  delete process.env.TWILIO_PHONE_NUMBER;
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------
describe("sendSms — success", () => {
  it("calls client.messages.create with to, from, and body", async () => {
    await sendSms(LEAD_ID, TO, BODY);

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(mockMessagesCreate).toHaveBeenCalledWith({
      to: TO,
      from: "+18005550000",
      body: BODY,
    });
  });

  it("uses TWILIO_PHONE_NUMBER env var as the from number", async () => {
    process.env.TWILIO_PHONE_NUMBER = "+18889990000";
    await sendSms(LEAD_ID, TO, BODY);

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "+18889990000" })
    );
  });

  it("writes an OUTBOUND MessageLog row after a successful send", async () => {
    await sendSms(LEAD_ID, TO, BODY);

    expect(mockMessageLogCreate).toHaveBeenCalledTimes(1);
    expect(mockMessageLogCreate).toHaveBeenCalledWith({
      data: {
        leadId: LEAD_ID,
        direction: "OUTBOUND",
        body: BODY,
      },
    });
  });

  it("returns the created MessageLog and Twilio SID", async () => {
    const result = await sendSms(LEAD_ID, TO, BODY);

    expect(result.twilioSid).toBe(TWILIO_SID);
    expect(result.messageLog).toEqual(FAKE_MESSAGE_LOG);
  });
});

// ---------------------------------------------------------------------------
// Twilio error path
// ---------------------------------------------------------------------------
describe("sendSms — Twilio failure", () => {
  it("throws SmsSendError when Twilio rejects the request", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Invalid phone number"));

    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow(SmsSendError);
  });

  it("includes the original error message in SmsSendError", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Account suspended"));

    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow("Account suspended");
  });

  it("does NOT write to MessageLog when Twilio fails", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Twilio error"));

    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow(SmsSendError);
    expect(mockMessageLogCreate).not.toHaveBeenCalled();
  });

  it("wraps non-Error Twilio rejections in SmsSendError", async () => {
    mockMessagesCreate.mockRejectedValue("string error");

    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow(SmsSendError);
    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow("string error");
  });
});

// ---------------------------------------------------------------------------
// MessageLog write failure (SMS was sent, DB write failed)
// ---------------------------------------------------------------------------
describe("sendSms — MessageLog write failure", () => {
  it("throws when the MessageLog write fails after a successful send", async () => {
    mockMessageLogCreate.mockRejectedValue(new Error("DB connection lost"));

    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow("DB connection lost");
  });

  it("still called Twilio before the DB write failed", async () => {
    mockMessageLogCreate.mockRejectedValue(new Error("DB error"));

    await expect(sendSms(LEAD_ID, TO, BODY)).rejects.toThrow();
    // Twilio was called — the SMS was sent even though the log write failed
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SmsSendError identity
// ---------------------------------------------------------------------------
describe("SmsSendError", () => {
  it("is an instance of Error", () => {
    const err = new SmsSendError("test");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name 'SmsSendError'", () => {
    const err = new SmsSendError("test");
    expect(err.name).toBe("SmsSendError");
  });

  it("carries the message", () => {
    const err = new SmsSendError("could not send");
    expect(err.message).toBe("could not send");
  });

  it("carries the cause", () => {
    const cause = new Error("underlying cause");
    const err = new SmsSendError("wrapper", cause);
    expect(err.cause).toBe(cause);
  });
});
