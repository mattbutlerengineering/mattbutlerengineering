import { describe, expect, it } from "vitest";
import type { CommunicationPreference } from "@mbe/types";
import { closureNoticeChannels } from "./contact-policy.js";

const both = { hasEmail: true, hasSms: true };

describe("closureNoticeChannels", () => {
  it("urgent sends SMS and email wherever the guest has them, whatever the preference", () => {
    for (const preference of ["email_only", "sms_only", "both", "transactional_only", null]) {
      expect(
        closureNoticeChannels(preference as CommunicationPreference | null, both, true)
      ).toEqual(["email", "sms"]);
    }
  });

  it("urgent with one contact sends that one", () => {
    expect(closureNoticeChannels("both", { hasEmail: true, hasSms: false }, true)).toEqual([
      "email",
    ]);
    expect(closureNoticeChannels("both", { hasEmail: false, hasSms: true }, true)).toEqual(["sms"]);
  });

  it("non-urgent uses the preferred channel", () => {
    expect(closureNoticeChannels("email_only", both, false)).toEqual(["email"]);
    expect(closureNoticeChannels("sms_only", both, false)).toEqual(["sms"]);
    expect(closureNoticeChannels("both", both, false)).toEqual(["email", "sms"]);
    expect(closureNoticeChannels("transactional_only", both, false)).toEqual(["email"]);
    expect(closureNoticeChannels(null, both, false)).toEqual(["email"]);
  });

  it("non-urgent falls back to the other contact rather than leave the guest unreached", () => {
    expect(closureNoticeChannels("sms_only", { hasEmail: true, hasSms: false }, false)).toEqual([
      "email",
    ]);
    expect(closureNoticeChannels("email_only", { hasEmail: false, hasSms: true }, false)).toEqual([
      "sms",
    ]);
  });

  it("no contact at all yields no channel", () => {
    expect(closureNoticeChannels("both", { hasEmail: false, hasSms: false }, true)).toEqual([]);
  });
});
