import { prisma } from "@crm/db";
import type { Lead, InboundEmail } from "@crm/db";
import { parseLeadFromEmail, LeadParseError } from "./lead-parser.service.js";

/**
 * process-inbound-email.service.ts
 *
 * Orchestrates the full inbound email processing pipeline:
 *   1. Parse the raw email body into structured lead data
 *   2. Upsert the lead (create or skip if email already exists)
 *   3. Mark the InboundEmail record as processed (or record the error)
 *
 * WHY IDEMPOTENCY MATTERS
 * -----------------------
 * SendGrid retries webhook delivery on any non-2xx response, and again if
 * the receiving server times out. Your own Outlook forwarding rule may fire
 * more than once for the same message (e.g. if the forward destination is
 * temporarily unavailable and retried). Without idempotency:
 *
 *   - The same contact appears in your CRM twice
 *   - Outreach sequences trigger twice for the same person
 *   - Data integrity depends on how carefully every forwarded email is managed
 *
 * HOW IDEMPOTENCY IS IMPLEMENTED
 * --------------------------------
 * Lead.email has a @@unique constraint in the Prisma schema. The upsert call
 * uses email as the key:
 *
 *   prisma.lead.upsert({
 *     where: { email },
 *     create: { name, email, phone },
 *     update: {},           // no-op — existing lead is left unchanged
 *   })
 *
 * `update: {}` is intentional. The first email wins. If the same person
 * re-submits a form with updated details, the outreach team handles that
 * manually. Silently overwriting existing data from a webhook is not safe.
 *
 * ERROR HANDLING STRATEGY
 * -----------------------
 * Two distinct failure modes:
 *
 *   LeadParseError — the email body didn't match the expected format.
 *     The InboundEmail row is marked processed=true with the error message.
 *     This is intentional: we don't want SendGrid to retry an unparseable
 *     email forever. It's flagged for manual review instead.
 *
 *   Any other error — unexpected DB failure, network issue, etc.
 *     The InboundEmail row is marked processed=false with the error message.
 *     This allows the record to be reprocessed if the failure was transient.
 *     (Re-processing is manual for now; a retry queue comes later.)
 */

export interface ProcessResult {
  inboundEmail: InboundEmail;
  lead: Lead | null; // null if processing failed
}

export async function processInboundEmail(inboundEmailId: string): Promise<ProcessResult> {
  // Fetch the InboundEmail record — we need rawText and we want to guard
  // against processing an already-processed record.
  const inboundEmail = await prisma.inboundEmail.findUniqueOrThrow({
    where: { id: inboundEmailId },
  });

  // Guard: already processed (idempotency at the record level).
  // If this function is called twice with the same ID, the second call is a
  // no-op that returns the existing state.
  if (inboundEmail.processed) {
    return { inboundEmail, lead: null };
  }

  try {
    const { name, phone, email } = parseLeadFromEmail(inboundEmail.rawText);

    const lead = await prisma.lead.upsert({
      where: { email },
      create: { name, email, phone },
      // update is intentionally empty — first email wins.
      // Silently overwriting existing lead data from a webhook is unsafe.
      update: {},
    });

    const updated = await prisma.inboundEmail.update({
      where: { id: inboundEmailId },
      data: { processed: true, error: null },
    });

    return { inboundEmail: updated, lead };
  } catch (err: unknown) {
    const isParseError = err instanceof LeadParseError;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    const updated = await prisma.inboundEmail.update({
      where: { id: inboundEmailId },
      data: {
        // Parse errors: mark as processed so SendGrid stops retrying.
        // Other errors: leave as unprocessed so retries can succeed later.
        processed: isParseError,
        error: errorMessage,
      },
    });

    return { inboundEmail: updated, lead: null };
  }
}
