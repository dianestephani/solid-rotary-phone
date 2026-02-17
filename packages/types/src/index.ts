// ---------------------------------------------------------------------------
// API response envelope
// Every API response is wrapped in this shape so the frontend can reliably
// distinguish success from error without inspecting HTTP status codes alone.
// ---------------------------------------------------------------------------
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

// These string literal union types mirror the values stored in the database.
// They are enforced at the application layer (Zod) since SQLite does not
// support native enum types. On PostgreSQL migration these become CHECK
// constraints or native enums — no application code changes required.
export type LeadStatus =
  | "NEW"
  | "IN_SEQUENCE"
  | "RESPONDED"
  | "BOOKED"
  | "CLOSED";

export interface CreateLeadRequest {
  name: string;
  email: string;
  phone: string; // E.164 format, e.g. +15551234567
  status?: LeadStatus;
}

export interface UpdateLeadRequest {
  name?: string;
  email?: string;
  phone?: string;
  status?: LeadStatus;
  sequenceDay?: number;
  lastContactedAt?: string; // ISO 8601
}

export interface LeadResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  sequenceDay: number;
  lastContactedAt: string | null; // ISO 8601, null if never contacted
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// InboundEmail
// ---------------------------------------------------------------------------

export interface InboundEmailResponse {
  id: string;
  subject: string;
  rawText: string;
  processed: boolean;
  error: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// MessageLog
// ---------------------------------------------------------------------------

export type MessageDirection = "OUTBOUND" | "INBOUND";

export interface MessageLogResponse {
  id: string;
  leadId: string;
  direction: MessageDirection;
  body: string;
  sentAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Webhook payloads
// Used for Zod validation in the API before touching the database.
// ---------------------------------------------------------------------------

export interface SendGridInboundPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  envelope: string; // JSON string from SendGrid
}

export interface TwilioSmsPayload {
  From: string; // E.164 sender number
  To: string;   // Your Twilio number
  Body: string;
  MessageSid: string;
}
