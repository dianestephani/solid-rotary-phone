import type { Request, Response } from "express";
import type { ApiResponse, InboundEmailResponse } from "@crm/types";
import { inboundEmailSchema } from "../schemas/inbound-email.js";
import { saveInboundEmail } from "../services/inbound-email.service.js";

/**
 * POST /webhooks/inbound-email
 *
 * Receives a SendGrid Inbound Parse webhook, validates the payload, and
 * persists the email to the InboundEmail table.
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

  try {
    const saved = await saveInboundEmail(parsed.data);

    const data: InboundEmailResponse = {
      id: saved.id,
      subject: saved.subject,
      rawText: saved.rawText,
      processed: saved.processed,
      error: saved.error,
      createdAt: saved.createdAt.toISOString(),
    };

    const response: ApiResponse<InboundEmailResponse> = { success: true, data };
    res.status(200).json(response);
  } catch {
    const response: ApiResponse<never> = {
      success: false,
      error: "Failed to save inbound email",
    };
    res.status(500).json(response);
  }
}
