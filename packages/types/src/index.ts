// API response envelope — every API response wraps data in this shape.
// This lets the frontend reliably check for errors without inspecting HTTP status codes alone.
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Contact API shapes
export interface CreateContactRequest {
  email: string;
  name?: string;
  phone?: string;
}

export interface ContactResponse {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: string; // ISO 8601 — dates are serialized as strings over HTTP
}

// Outreach API shapes
export type OutreachChannel = "EMAIL" | "SMS";
export type OutreachStatus = "PENDING" | "SENT" | "FAILED" | "REPLIED";

export interface CreateOutreachRequest {
  contactId: string;
  channel: OutreachChannel;
  subject?: string;
  body: string;
}

export interface OutreachResponse {
  id: string;
  contactId: string;
  channel: OutreachChannel;
  status: OutreachStatus;
  subject: string | null;
  body: string;
  sentAt: string | null;
  createdAt: string;
}

// Webhook payload shapes (for validation with Zod in the api)
export interface SendGridInboundPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  "envelope": string; // JSON string from SendGrid
}

export interface TwilioSmsPayload {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
}
