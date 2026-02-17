/**
 * Unit tests for src/middleware/verify-webhook-secret.ts
 *
 * The middleware reads process.env.SENDGRID_INBOUND_PARSE_SECRET and the
 * x-webhook-secret request header, then either calls next() or sends a 401/500.
 *
 * We construct minimal mock req/res/next objects — no need for supertest or
 * Express here. The middleware doesn't use any Express internals beyond the
 * three standard middleware arguments.
 */
import { verifyWebhookSecret } from "../middleware/verify-webhook-secret.js";
import type { Request, Response, NextFunction } from "express";

// Build a minimal mock Request with the given headers
function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

// Build a mock Response that captures status and json calls.
// statusCode and body are properties on the returned object so reads always
// reflect the value set by the middleware (not a snapshot from construction time).
function mockRes(): { res: Response; statusCode: number | undefined; body: unknown } {
  const mock: { res: Response; statusCode: number | undefined; body: unknown } = {
    res: null as unknown as Response,
    statusCode: undefined,
    body: undefined,
  };

  mock.res = {
    status(code: number) {
      mock.statusCode = code;
      return mock.res;
    },
    json(body: unknown) {
      mock.body = body;
      return mock.res;
    },
  } as unknown as Response;

  return mock;
}

// A jest.fn() that tracks whether next() was called
function mockNext(): jest.Mock {
  return jest.fn();
}

// ---------------------------------------------------------------------------
// Helpers to set / clear the env var cleanly per test
// ---------------------------------------------------------------------------
const SECRET = "test-secret-value";

beforeEach(() => {
  process.env.SENDGRID_INBOUND_PARSE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SENDGRID_INBOUND_PARSE_SECRET;
});

// ---------------------------------------------------------------------------
// Valid secret
// ---------------------------------------------------------------------------
describe("valid secret", () => {
  it("calls next() when the header matches the env var", () => {
    const req = mockReq({ "x-webhook-secret": SECRET });
    const { res } = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not call res.status() when the secret is valid", () => {
    const req = mockReq({ "x-webhook-secret": SECRET });
    const mock = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, mock.res, next);

    // If status was called, body would be set
    expect(mock.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wrong secret
// ---------------------------------------------------------------------------
describe("wrong secret", () => {
  it("returns 401 when the header value does not match", () => {
    const req = mockReq({ "x-webhook-secret": "wrong-value" });
    const mock = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, mock.res, next);

    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns a JSON body with success: false on 401", () => {
    const req = mockReq({ "x-webhook-secret": "wrong-value" });
    const mock = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, mock.res, next);

    expect(mock.body).toMatchObject({ success: false, error: "Unauthorized" });
  });
});

// ---------------------------------------------------------------------------
// Missing header
// ---------------------------------------------------------------------------
describe("missing header", () => {
  it("returns 401 when the x-webhook-secret header is absent", () => {
    const req = mockReq({});
    const mock = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, mock.res, next);

    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Missing env var
// ---------------------------------------------------------------------------
describe("missing env var", () => {
  it("returns 500 when SENDGRID_INBOUND_PARSE_SECRET is not set", () => {
    delete process.env.SENDGRID_INBOUND_PARSE_SECRET;

    const req = mockReq({ "x-webhook-secret": SECRET });
    const mock = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, mock.res, next);

    expect(mock.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns a JSON body with success: false on 500", () => {
    delete process.env.SENDGRID_INBOUND_PARSE_SECRET;

    const req = mockReq({ "x-webhook-secret": SECRET });
    const mock = mockRes();
    const next: NextFunction = mockNext();

    verifyWebhookSecret(req, mock.res, next);

    expect(mock.body).toMatchObject({ success: false });
  });
});
