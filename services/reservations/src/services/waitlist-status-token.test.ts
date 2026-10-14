import { describe, it, expect } from "vitest";
import {
  generateWaitlistStatusToken,
  verifyWaitlistStatusToken,
  WAITLIST_STATUS_TOKEN_TTL_MS,
} from "./waitlist-status-token.js";

const NOW = new Date("2026-06-01T18:00:00Z").getTime();

describe("waitlist status token", () => {
  it("round-trips the entry id for the venue it was minted for", () => {
    const token = generateWaitlistStatusToken("entry-1", "venue-1", NOW);
    expect(verifyWaitlistStatusToken(token, "venue-1", NOW + 1000)).toEqual({
      valid: true,
      entryId: "entry-1",
    });
  });

  it("rejects the token under a different venue", () => {
    const token = generateWaitlistStatusToken("entry-1", "venue-1", NOW);
    expect(verifyWaitlistStatusToken(token, "venue-2", NOW).valid).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = generateWaitlistStatusToken("entry-1", "venue-1", NOW);
    const later = NOW + WAITLIST_STATUS_TOKEN_TTL_MS + 1;
    expect(verifyWaitlistStatusToken(token, "venue-1", later).valid).toBe(false);
  });

  it("rejects a tampered entry id", () => {
    const token = generateWaitlistStatusToken("entry-1", "venue-1", NOW);
    const [, expiry, signature] = Buffer.from(token, "base64url").toString().split(":");
    const forged = Buffer.from(`entry-2:${expiry}:${signature}`).toString("base64url");
    expect(verifyWaitlistStatusToken(forged, "venue-1", NOW).valid).toBe(false);
  });

  it("rejects garbage without throwing", () => {
    expect(verifyWaitlistStatusToken("not-a-token", "venue-1", NOW).valid).toBe(false);
    expect(verifyWaitlistStatusToken("", "venue-1", NOW).valid).toBe(false);
  });
});
