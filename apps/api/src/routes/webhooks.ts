import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import express from "express";
import { verifyWebhookSecret } from "../middleware/verify-webhook-secret.js";
import { handleInboundEmail } from "../controllers/inbound-email.controller.js";

export const webhooksRouter: ExpressRouter = Router();

// SendGrid Inbound Parse POSTs multipart/form-data, not JSON.
// express.urlencoded() parses the URL-encoded form fields that SendGrid sends
// when it encodes the multipart payload as application/x-www-form-urlencoded.
// This middleware is scoped to this router only — it does not affect other routes.
webhooksRouter.use(express.urlencoded({ extended: true }));

// POST /webhooks/inbound-email
// verifyWebhookSecret runs first; if it calls next(), handleInboundEmail runs.
webhooksRouter.post("/inbound-email", verifyWebhookSecret, handleInboundEmail);
