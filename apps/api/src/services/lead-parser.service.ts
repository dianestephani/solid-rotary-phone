/**
 * lead-parser.service.ts
 *
 * Parses a consistently-formatted forwarded email body into structured lead data.
 *
 * EXPECTED EMAIL FORMAT
 * ---------------------
 * Forwarded emails from Outlook arrive with this exact structure:
 *
 *   Name: John Smith
 *   Phone: 555-123-4567
 *   Email: john@email.com
 *
 * If the format changes (e.g. field order, label casing, extra fields), the
 * regexes below are the single place to update. The format version is noted
 * here so future changes are explicit:
 *
 *   Format version: 1
 *   Labels: "Name", "Phone", "Email" (title-case, colon-separated)
 *   Phone style: US local (555-123-4567) or full E.164 (+15551234567)
 *
 * PHONE NORMALIZATION
 * -------------------
 * The parser normalises any phone number it finds to E.164:
 *
 *   555-123-4567        → +15551234567   (US 10-digit, +1 prepended)
 *   (555) 123-4567      → +15551234567   (US with parens)
 *   1-555-123-4567      → +15551234567   (US with country code)
 *   15551234567         → +15551234567   (11-digit starting with 1)
 *   +15551234567        → +15551234567   (already E.164, passed through)
 *   +447700900123       → +447700900123  (international E.164, passed through)
 *
 * Numbers that do not produce 10 or 11 digits after stripping non-digits
 * throw a LeadParseError.
 *
 * IDEMPOTENCY NOTE
 * ----------------
 * This service is pure — it has no database knowledge. Idempotency (upsert
 * on email) is handled one layer up in process-inbound-email.service.ts.
 */

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown when the email body does not match the expected format.
 * Callers catch this specifically to distinguish parse failures from
 * unexpected runtime errors.
 */
export class LeadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadParseError";
  }
}

// ---------------------------------------------------------------------------
// Parsed result type
// ---------------------------------------------------------------------------

export interface ParsedLead {
  name: string;
  phone: string; // always E.164 after normalization
  email: string;
}

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

// Case-insensitive, optional whitespace around the colon, captures to end of line.
const NAME_RE = /^Name\s*:\s*(.+)$/im;
const PHONE_RE = /^Phone\s*:\s*(.+)$/im;
const EMAIL_RE = /^Email\s*:\s*(.+)$/im;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts name, phone, and email from a forwarded email body.
 *
 * @throws {LeadParseError} if any field is missing or the phone cannot be
 *   normalised to E.164.
 */
export function parseLeadFromEmail(body: string): ParsedLead {
  const name = extractField(body, NAME_RE, "Name");
  const rawPhone = extractField(body, PHONE_RE, "Phone");
  const email = extractField(body, EMAIL_RE, "Email");

  const phone = normalizePhone(rawPhone);

  return { name, phone, email };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractField(body: string, re: RegExp, fieldName: string): string {
  const match = body.match(re);
  if (!match || !match[1].trim()) {
    throw new LeadParseError(`Could not extract "${fieldName}" from email body`);
  }
  return match[1].trim();
}

/**
 * Normalises a phone string to E.164 format.
 *
 * Accepts:
 *   - Already-valid E.164  (+15551234567, +447700900123)
 *   - US 10-digit local    (555-123-4567, (555) 123-4567, 5551234567)
 *   - US 11-digit with 1   (15551234567, 1-555-123-4567)
 *
 * @throws {LeadParseError} if the digit count doesn't match any known pattern.
 */
export function normalizePhone(raw: string): string {
  // Already valid E.164 — pass through without modification.
  if (/^\+\d{7,15}$/.test(raw)) {
    return raw;
  }

  // Strip everything except digits.
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    // US local number — prepend US country code.
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    // US number with country code already included.
    return `+${digits}`;
  }

  throw new LeadParseError(
    `Phone "${raw}" could not be normalised to E.164. ` +
      `Expected a 10-digit US number or a number already in E.164 format (+...).`
  );
}
