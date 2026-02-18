import { prisma } from "@crm/db";
import type { InboundEmail } from "@crm/db";
import type { InboundEmailInput } from "../schemas/inbound-email.js";

/**
 * Persists a validated inbound email payload to the InboundEmail table.
 *
 * The service layer has no knowledge of HTTP — it receives plain data and
 * returns a plain result. This keeps it independently testable and reusable
 * (e.g. from a queue worker or CLI script) without any Express machinery.
 *
 * rawText strategy:
 *   We store text if present, falling back to html. The caller has already
 *   confirmed that at least one exists via the Zod schema refine. This gives
 *   downstream processing a consistent field to read from.
 */
export async function saveInboundEmail(input: InboundEmailInput): Promise<InboundEmail> {
  const rawText = input.text ?? input.html ?? "";

  return prisma.inboundEmail.create({
    data: {
      subject: input.subject,
      rawText,
      processed: false,
    },
  });
}
