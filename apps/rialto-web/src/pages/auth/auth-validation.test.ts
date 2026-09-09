import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isAcceptedMfaCode,
  MFA_CODE_LENGTH,
  MFA_REJECT_CODE,
} from "./auth-validation";

describe("isValidEmail", () => {
  it("accepts a plain address", () => {
    expect(isValidEmail("ada@example.com")).toBe(true);
  });

  it("accepts subdomains and plus-addressing", () => {
    expect(isValidEmail("ada+test@mail.example.co.uk")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects a missing @", () => {
    expect(isValidEmail("ada.example.com")).toBe(false);
  });

  it("rejects a missing domain dot", () => {
    expect(isValidEmail("ada@example")).toBe(false);
  });

  it("rejects whitespace inside the address", () => {
    expect(isValidEmail("ada lovelace@example.com")).toBe(false);
  });

  it("rejects a missing local part", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });
});

describe("isAcceptedMfaCode", () => {
  it("accepts any complete numeric code", () => {
    expect(isAcceptedMfaCode("123456")).toBe(true);
    expect(isAcceptedMfaCode("999999")).toBe(true);
  });

  it("rejects the demo reject code", () => {
    expect(isAcceptedMfaCode(MFA_REJECT_CODE)).toBe(false);
  });

  it("rejects incomplete codes", () => {
    expect(isAcceptedMfaCode("12345")).toBe(false);
    expect(isAcceptedMfaCode("")).toBe(false);
  });

  it("rejects non-numeric codes", () => {
    expect(isAcceptedMfaCode("12a456")).toBe(false);
  });

  it("the reject code is a complete code (it fails verification, not completeness)", () => {
    expect(MFA_REJECT_CODE).toHaveLength(MFA_CODE_LENGTH);
  });
});
