import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Resend } from "resend";
import { ResendNotificationAdapter } from "./resend-adapter.js";
import { ProviderRejectedError } from "./provider-rejected-error.js";

/**
 * Win-back releases its claim only on a DEFINITE rejection, so the adapter must tell one from
 * "nobody knows if it went out". The real SDK (6.x) never rejects: `fetchRequest` turns a
 * network failure into `{ error: { name: "application_error", statusCode: null } }`, and every
 * non-2xx into `{ error }` too. So this drives the REAL SDK with only `fetch` stubbed; a mock
 * that makes `send` reject would test a path the SDK never takes (#8041).
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function adapter(): ResendNotificationAdapter {
  return new ResendNotificationAdapter({
    resend: new Resend("re_test_key") as never,
    fromAddress: "bookings@mbe.dev",
    manageBaseUrl: "https://app.mbe.dev",
    publicApiBaseUrl: "https://api.mbe.dev",
  });
}

const winBack = {
  guestName: "Jane",
  guestEmail: "jane@example.com",
  venueName: "Oak",
  idempotencyKey: "win-back/g1/t",
};

async function outcome(respond: () => Response | Promise<Response>): Promise<unknown> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respond())
  );
  return adapter()
    .sendWinBack(winBack)
    .then(
      () => "resolved",
      (e: unknown) => e
    );
}

describe("ResendNotificationAdapter — real SDK, stubbed fetch (#8041)", () => {
  beforeEach(() => {
    // The SDK logs every API error to console.error outside production.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves on a 200", async () => {
    expect(await outcome(() => json(200, { id: "e1" }))).toBe("resolved");
  });

  it("treats a 422 validation error as a definite rejection", async () => {
    const err = await outcome(() =>
      json(422, { name: "validation_error", statusCode: 422, message: "bad" })
    );
    expect(err).toBeInstanceOf(ProviderRejectedError);
  });

  it("treats a 401 (revoked key) as a definite rejection", async () => {
    const err = await outcome(() =>
      json(401, { name: "restricted_api_key", statusCode: 401, message: "no" })
    );
    expect(err).toBeInstanceOf(ProviderRejectedError);
  });

  it.each([
    ["a network failure (fetch rejects)", () => Promise.reject(new TypeError("fetch failed"))],
    [
      "a connection reset",
      () => Promise.reject(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })),
    ],
    [
      "a 500 JSON error",
      () => json(500, { name: "internal_server_error", statusCode: 500, message: "boom" }),
    ],
    ["an HTML 502", () => new Response("<html>bad gateway</html>", { status: 502 })],
    ["an HTML 504", () => new Response("<html>timeout</html>", { status: 504 })],
    [
      "a 409 concurrent_idempotent_requests (the first request may still be in flight)",
      () =>
        json(409, {
          name: "concurrent_idempotent_requests",
          statusCode: 409,
          message: "in progress",
        }),
    ],
    [
      "a 408 timeout",
      () => json(408, { name: "application_error", statusCode: 408, message: "timeout" }),
    ],
    [
      "a 429 (an accepted-then-limited request is not proven unsent)",
      () => json(429, { name: "rate_limit_exceeded", statusCode: 429, message: "slow" }),
    ],
  ])("does NOT call %s a rejection: the claim must be kept", async (_name, respond) => {
    const err = await outcome(respond);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderRejectedError);
  });

  it("still throws (does not resolve) for those failures, so no caller counts them as sent", async () => {
    const err = await outcome(() => Promise.reject(new TypeError("fetch failed")));
    expect(err).not.toBe("resolved");
    expect((err as Error).message).toMatch(/Resend send failed/);
  });
});
