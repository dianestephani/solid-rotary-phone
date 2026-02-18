import type { Request, Response } from "express";
import type { ApiResponse, InboundEmailResponse } from "@crm/types";
import { inboundEmailSchema } from "../schemas/inbound-email.js";
import { saveInboundEmail } from "../services/inbound-email.service.js";
import { processInboundEmail } from "../services/process-inbound-email.service.js";

/**
 * POST /webhooks/inbound-email
 *
 * Receives a SendGrid Inbound Parse webhook, validates the payload, persists
 * the raw email, then immediately runs the processing pipeline (parse lead,
 * upsert to DB, mark processed).
 *
 * The route applies express.urlencoded() before this handler because SendGrid
 * posts multipart/form-data which express.json() cannot parse.
 *
 * Response on success: 200 with the saved InboundEmail record.
 * Response on bad payload: 400 with validation error messages.
 * Response on DB error: 500.
 *
 * Why 200 and not 201?
 * SendGrid retries on any non-2xx response. Returning 200 (rather than 201)
 * is the conventional choice for webhooks — the caller does not need to know
 * the ID of the created resource.
 *
 * Why respond only after processing is complete?
 * We await processInboundEmail before responding so the returned InboundEmail
 * reflects the final processed state. If processing becomes slow (e.g. external
 * API calls during parsing), move processInboundEmail to a background queue
 * and respond immediately after saveInboundEmail.
 */
export async function handleInboundEmail(req: Request, res: Response): Promise<void> {
  const parsed = inboundEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
    res.status(400).json(response);
    return;
  }

  let savedId: string;
  try {
    const saved = await saveInboundEmail(parsed.data);
    savedId = saved.id;
  } catch {
    const response: ApiResponse<never> = {
      success: false,
      error: "Failed to save inbound email",
    };
    res.status(500).json(response);
    return;
  }

  // Processing errors (parse failures, DB errors) are recorded on the
  // InboundEmail row and do NOT cause a non-2xx response — SendGrid must
  // not retry emails that we've intentionally flagged as unparseable.
  const { inboundEmail } = await processInboundEmail(savedId);

  const data: InboundEmailResponse = {
    id: inboundEmail.id,
    subject: inboundEmail.subject,
    rawText: inboundEmail.rawText,
    processed: inboundEmail.processed,
    error: inboundEmail.error,
    createdAt: inboundEmail.createdAt.toISOString(),
  };

  const response: ApiResponse<InboundEmailResponse> = { success: true, data };
  res.status(200).json(response);
}
