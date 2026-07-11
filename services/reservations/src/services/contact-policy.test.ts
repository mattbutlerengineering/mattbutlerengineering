import { describe, it, expect } from "vitest";
import type { CommunicationPreference } from "@mbe/types";
import { canContact, resolveChannel } from "./contact-policy.js";
import type { ContactState, MessageClass } from "./contact-policy.js";

describe("resolveChannel (single preference fallback owner)", () => {
  const cases: Array<[CommunicationPreference | null | undefined, CommunicationPreference]> = [
    ["email_only", "email_only"],
    ["sms_only", "sms_only"],
    ["both", "both"],
    ["transactional_only", "transactional_only"],
    [null, "email_only"],
    [undefined, "email_only"],
  ];

  it.each(cases)("resolveChannel(%s) → %s", (input, expected) => {
    expect(resolveChannel(input)).toBe(expected);
  });
});

describe("canContact (consent gate: unsubscribed × message class)", () => {
  const cases: Array<{
    name: string;
    state: ContactState;
    messageClass: MessageClass;
    expected: boolean;
  }> = [
    {
      name: "unsubscribed guest + marketing → blocked",
      state: { unsubscribed: true, communicationPreference: "both" },
      messageClass: "marketing",
      expected: false,
    },
    {
      name: "unsubscribed guest + transactional (booking confirmation/reminder) → allowed",
      state: { unsubscribed: true, communicationPreference: "both" },
      messageClass: "transactional",
      expected: true,
    },
    {
      name: "subscribed guest + marketing → allowed",
      state: { unsubscribed: false, communicationPreference: "email_only" },
      messageClass: "marketing",
      expected: true,
    },
    {
      name: "subscribed guest + transactional → allowed",
      state: { unsubscribed: false, communicationPreference: "email_only" },
      messageClass: "transactional",
      expected: true,
    },
    {
      name: "transactional_only preference + marketing → blocked",
      state: { unsubscribed: false, communicationPreference: "transactional_only" },
      messageClass: "marketing",
      expected: false,
    },
    {
      name: "transactional_only preference + transactional → allowed",
      state: { unsubscribed: false, communicationPreference: "transactional_only" },
      messageClass: "transactional",
      expected: true,
    },
    {
      name: "no stored preference (fallback) + marketing → allowed",
      state: { unsubscribed: false, communicationPreference: null },
      messageClass: "marketing",
      expected: true,
    },
    {
      name: "unsubscribed guest with no stored preference + marketing → blocked",
      state: { unsubscribed: true, communicationPreference: null },
      messageClass: "marketing",
      expected: false,
    },
  ];

  it.each(cases)("$name", ({ state, messageClass, expected }) => {
    expect(canContact(state, messageClass)).toBe(expected);
  });
});
