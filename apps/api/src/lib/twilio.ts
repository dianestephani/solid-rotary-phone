import Twilio from "twilio";

/**
 * Lazy Twilio client singleton.
 *
 * WHY LAZY?
 * The Twilio constructor reads credentials from its arguments at construction
 * time. If we constructed the client at module load time (top-level
 * `new Twilio(...)`) any import of this file — including in Jest — would
 * immediately try to read env vars that don't exist in the test environment.
 *
 * By deferring construction to the first call, test files that mock this
 * module with jest.mock("../lib/twilio.js") never trigger the constructor,
 * and the real client is only built when production code actually needs it.
 *
 * WHY A MODULE-LEVEL SINGLETON (not constructed per-call)?
 * The Twilio SDK maintains an internal HTTP connection pool. Constructing a
 * new client on every sendSms() call would create a new pool each time and
 * leave the previous one open. One instance per process is the correct usage.
 *
 * WHY lib/ NOT services/?
 * lib/ holds configured third-party adapters — objects that wrap external
 * SDKs with no business logic of their own. services/ holds functions that
 * implement business logic using those adapters. The Twilio client is
 * infrastructure; sendSms() is the logic.
 */

let _client: ReturnType<typeof Twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof Twilio> {
  if (!_client) {
    // env.ts crashes the server at startup if these are missing, so by the
    // time this function is called in production they are guaranteed to exist.
    _client = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
  }
  return _client;
}

/**
 * Replaces the singleton — used in tests to inject a mock client.
 * Not exported to production consumers; only accessible via jest.mock().
 */
export function _setTwilioClient(client: ReturnType<typeof Twilio> | null): void {
  _client = client;
}
