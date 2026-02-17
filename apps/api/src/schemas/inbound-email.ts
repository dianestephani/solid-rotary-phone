import { z } from "zod";

/**
 * Zod schema for the SendGrid Inbound Parse webhook payload.
 *
 * SendGrid POSTs multipart/form-data (not JSON). Express's express.json()
 * middleware does not parse it — express.urlencoded() or a multipart parser
 * (e.g. multer) must be applied to the webhook route before this schema runs.
 *
 * Field notes:
 *   from     — "Name <email>" or plain email address from the SMTP envelope
 *   to       — Recipient address (the inbound parse domain address)
 *   subject  — Email subject line; empty string if missing
 *   text     — Plain-text body; optional (HTML-only emails omit this)
 *   html     — HTML body; optional (plain-text-only emails omit this)
 *   envelope — JSON string: { "from": "...", "to": ["..."] }
 *
 * At least one of `text` or `html` must be present — we enforce this with a
 * top-level refine so callers get a clear error message rather than saving a
 * row with empty content.
 */
export const inboundEmailSchema = z
  .object({
    from: z.string().min(1, "from is required"),
    to: z.string().min(1, "to is required"),
    subject: z.string().default(""),
    text: z.string().optional(),
    html: z.string().optional(),
    envelope: z.string().min(1, "envelope is required"),
  })
  .refine((data) => data.text || data.html, {
    message: "at least one of text or html must be present",
  });

export type InboundEmailInput = z.infer<typeof inboundEmailSchema>;
