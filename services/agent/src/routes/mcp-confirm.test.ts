import { describe, it, expect } from "vitest";
import { canonicalJson, signConfirm, verifyConfirm, CONFIRM_TTL_MS } from "./mcp-confirm.js";

const TOKEN = "mbe_pat_secret-one";
const NOW = 1_800_000_000_000;
const claims = {
  tool: "pause_tables",
  venueId: "v1",
  input: { until: "2026-12-01", tables: ["Patio 1"] },
};

describe("confirm token", () => {
  it("round-trips the input it was signed over, with a nonce and a 5 minute expiry", () => {
    const signed = signConfirm(TOKEN, claims, NOW);
    expect(signed.expiresAt).toBe(NOW + CONFIRM_TTL_MS);
    expect(CONFIRM_TTL_MS).toBe(5 * 60 * 1000);
    const result = verifyConfirm(TOKEN, signed.confirmToken, claims.tool, claims.venueId, NOW + 1);
    expect(result).toEqual({
      ok: true,
      input: claims.input,
      nonce: expect.any(String),
    });
  });

  it("mints a fresh nonce each time", () => {
    const a = verifyConfirm(
      TOKEN,
      signConfirm(TOKEN, claims, NOW).confirmToken,
      "pause_tables",
      "v1",
      NOW
    );
    const b = verifyConfirm(
      TOKEN,
      signConfirm(TOKEN, claims, NOW).confirmToken,
      "pause_tables",
      "v1",
      NOW
    );
    expect(a.ok && b.ok && a.nonce !== b.nonce).toBe(true);
  });

  it("never contains the access token", () => {
    const { confirmToken } = signConfirm(TOKEN, claims, NOW);
    expect(confirmToken).not.toContain(TOKEN);
    expect(Buffer.from(confirmToken.split(".")[0]!, "base64url").toString()).not.toContain(TOKEN);
  });

  it("refuses an expired token", () => {
    const { confirmToken } = signConfirm(TOKEN, claims, NOW);
    expect(
      verifyConfirm(TOKEN, confirmToken, "pause_tables", "v1", NOW + CONFIRM_TTL_MS + 1)
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a token signed with another access token", () => {
    const { confirmToken } = signConfirm("mbe_pat_other", claims, NOW);
    expect(verifyConfirm(TOKEN, confirmToken, "pause_tables", "v1", NOW).ok).toBe(false);
  });

  it("refuses a tampered payload or signature", () => {
    const { confirmToken } = signConfirm(TOKEN, claims, NOW);
    const [payload, sig] = confirmToken.split(".") as [string, string];
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        input: { tables: ["Bar"] },
      })
    ).toString("base64url");
    expect(verifyConfirm(TOKEN, `${forged}.${sig}`, "pause_tables", "v1", NOW).ok).toBe(false);
    expect(
      verifyConfirm(TOKEN, `${payload}.${sig.slice(0, -2)}AA`, "pause_tables", "v1", NOW).ok
    ).toBe(false);
    expect(verifyConfirm(TOKEN, `${payload}.`, "pause_tables", "v1", NOW).ok).toBe(false);
    expect(verifyConfirm(TOKEN, "garbage", "pause_tables", "v1", NOW).ok).toBe(false);
  });

  it("refuses a token for another tool or venue", () => {
    const { confirmToken } = signConfirm(TOKEN, claims, NOW);
    expect(verifyConfirm(TOKEN, confirmToken, "resume_tables", "v1", NOW).ok).toBe(false);
    expect(verifyConfirm(TOKEN, confirmToken, "pause_tables", "v2", NOW).ok).toBe(false);
  });

  it("canonicalises input regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } })).toBe(
      '{"a":{"c":3,"d":[2,{"y":2,"z":1}]},"b":1}'
    );
  });
});
