import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Signed confirmation for MCP write tools (#9781). A first call writes nothing
 * and returns a token over what will happen; the confirming call carries that
 * token back and runs exactly the input inside it. The token is an HMAC-SHA256
 * keyed by the caller's own personal access token, so only its holder can mint
 * one and the model, which never sees the access token, cannot forge one. The
 * access token itself is never in the payload.
 */
export const CONFIRM_TTL_MS = 5 * 60 * 1000;

export interface ConfirmClaims {
  readonly tool: string;
  readonly venueId: string;
  readonly input: Record<string, unknown>;
}

interface Payload extends ConfirmClaims {
  readonly nonce: string;
  readonly exp: number;
}

export type ConfirmVerdict =
  | { readonly ok: true; readonly input: Record<string, unknown>; readonly nonce: string }
  | { readonly ok: false; readonly reason: "invalid" | "expired" };

/** JSON with object keys sorted, so the same input always signs the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

const mac = (accessToken: string, payload: string): Buffer =>
  createHmac("sha256", accessToken).update(payload).digest();

export function signConfirm(
  accessToken: string,
  claims: ConfirmClaims,
  now: number = Date.now()
): { readonly confirmToken: string; readonly expiresAt: number } {
  const expiresAt = now + CONFIRM_TTL_MS;
  const payload = Buffer.from(
    canonicalJson({ ...claims, nonce: randomUUID(), exp: expiresAt })
  ).toString("base64url");
  return {
    confirmToken: `${payload}.${mac(accessToken, payload).toString("base64url")}`,
    expiresAt,
  };
}

const INVALID = { ok: false, reason: "invalid" } as const;

const isPayload = (value: unknown): value is Payload => {
  const p = value as Partial<Payload> | null;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.tool === "string" &&
    typeof p.venueId === "string" &&
    typeof p.nonce === "string" &&
    typeof p.exp === "number" &&
    typeof p.input === "object" &&
    p.input !== null &&
    !Array.isArray(p.input)
  );
};

/**
 * Checks the signature (constant time) before reading anything inside, then the
 * tool, venue and expiry. On success the input to run is the one signed.
 */
export function verifyConfirm(
  accessToken: string,
  confirmToken: string,
  tool: string,
  venueId: string,
  now: number = Date.now()
): ConfirmVerdict {
  const parts = confirmToken.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return INVALID;
  const [payload, signature] = parts as [string, string];
  const given = Buffer.from(signature, "base64url");
  const expected = mac(accessToken, payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return INVALID;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return INVALID;
  }
  if (!isPayload(claims) || claims.tool !== tool || claims.venueId !== venueId) return INVALID;
  if (now > claims.exp) return { ok: false, reason: "expired" };
  return { ok: true, input: claims.input, nonce: claims.nonce };
}
