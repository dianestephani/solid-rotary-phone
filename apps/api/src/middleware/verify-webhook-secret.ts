import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@crm/types";

/**
 * Express middleware that checks the incoming request for a shared secret.
 *
 * The secret is read from the `x-webhook-secret` request header and compared
 * against the `SENDGRID_INBOUND_PARSE_SECRET` environment variable.
 *
 * Why a header rather than a query param?
 * Query params are written to server access logs and can appear in browser
 * history. Headers are not logged by default and are not cached. For a shared
 * secret this is meaningfully more secure.
 *
 * Why not HMAC signature verification?
 * SendGrid's inbound parse webhook does not sign requests with an HMAC the way
 * its event webhook does. The shared secret header is the correct approach for
 * this webhook type.
 *
 * Usage:
 *   router.post("/inbound-email", verifyWebhookSecret, controller);
 */
export function verifyWebhookSecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secret = process.env.SENDGRID_INBOUND_PARSE_SECRET;
  const provided = req.headers["x-webhook-secret"];

  if (!secret) {
    // If the env var is missing, refuse all requests — safer than allowing them.
    // This should never happen in practice because env.ts crashes at startup if
    // SENDGRID_INBOUND_PARSE_SECRET is absent, but we guard it here too so the
    // middleware remains independently safe when unit tested without env.ts.
    const response: ApiResponse<never> = {
      success: false,
      error: "Webhook secret is not configured",
    };
    res.status(500).json(response);
    return;
  }

  if (!provided || provided !== secret) {
    const response: ApiResponse<never> = {
      success: false,
      error: "Unauthorized",
    };
    res.status(401).json(response);
    return;
  }

  next();
}
