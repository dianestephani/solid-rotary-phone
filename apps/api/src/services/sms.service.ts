import { prisma } from "@crm/db";
import type { MessageLog } from "@crm/db";
import { getTwilioClient } from "../lib/twilio.js";

/**
 * Result returned by sendSms on success.
 */
export interface SendSmsResult {
  messageLog: MessageLog;
  twilioSid: string;
}

/**
 * Typed error thrown when Twilio rejects the send request.
 * Callers can catch this specifically to distinguish Twilio errors from
 * unexpected runtime errors (DB failures, bugs, etc.).
 */
export class SmsSendError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "SmsSendError";
  }
}

/**
 * Sends an outbound SMS via Twilio and records it in the MessageLog table.
 *
 * @param leadId  - UUID of the Lead this message is associated with
 * @param to      - Recipient phone number in E.164 format (e.g. +15551234567)
 * @param body    - Message text (Twilio enforces its own length limits)
 *
 * @returns SendSmsResult containing the created MessageLog row and Twilio SID
 * @throws SmsSendError if Twilio rejects the request
 *
 * WHY WRAP TWILIO IN A SERVICE?
 * -----------------------------
 * Calling the Twilio SDK directly inside a route handler creates several problems:
 *
 *   1. Testability — You cannot unit test a route that directly calls Twilio
 *      without either hitting the real API (slow, costs money, requires credentials)
 *      or using a complex HTTP interceptor. A service can be mocked with
 *      jest.mock() in one line.
 *
 *   2. Single responsibility — A route handler should translate HTTP into a
 *      function call and back. Credential management, SDK initialization, and
 *      MessageLog writes are not HTTP concerns.
 *
 *   3. Reusability — sendSms() can be called from a scheduled job, a CLI
 *      script, or a queue worker without any Express context. If it lived in
 *      a route handler it would be unreachable from non-HTTP callers.
 *
 *   4. Error normalization — Twilio throws its own error types. Wrapping them
 *      in SmsSendError gives the rest of the application a consistent error
 *      type to handle, independent of what the Twilio SDK does internally.
 *
 * LOG-THEN-SEND vs SEND-THEN-LOG
 * --------------------------------
 * We send first, then log. The alternative (log first, mark failed on error)
 * would leave orphan MessageLog rows for messages that were never sent. A
 * missed log entry for a message that was sent is easier to recover from
 * (Twilio's dashboard shows it) than a misleading log entry for a message
 * that was never sent.
 */
export async function sendSms(
  leadId: string,
  to: string,
  body: string
): Promise<SendSmsResult> {
  const from = process.env.TWILIO_PHONE_NUMBER!;
  const client = getTwilioClient();

  let twilioSid: string;

  try {
    const message = await client.messages.create({ to, from, body });
    twilioSid = message.sid;
  } catch (err: unknown) {
    throw new SmsSendError(
      `Failed to send SMS to ${to}: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  // Log the outbound message. If this write fails, we still return an error
  // to the caller — but the SMS was sent. The Twilio dashboard remains the
  // source of truth for delivery in that edge case.
  const messageLog = await prisma.messageLog.create({
    data: {
      leadId,
      direction: "OUTBOUND",
      body,
    },
  });

  return { messageLog, twilioSid };
}
