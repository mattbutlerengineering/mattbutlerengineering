/**
 * Pure validation helpers for the auth demo pages.
 * Everything here is demo-grade by design — no network, no real verification.
 */

/** Number of digits in the demo authenticator code. */
export const MFA_CODE_LENGTH = 6;

/**
 * The one code the demo rejects, so the error state is demonstrable.
 * Every other complete numeric code verifies successfully.
 */
export const MFA_REJECT_CODE = "000000";

/**
 * Pragmatic email shape check for inline form feedback: one @, a non-empty
 * local part, and a dotted domain with no whitespace. Intentionally not
 * RFC 5322 — a demo form wants honest, predictable feedback.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** True when the code is complete, numeric, and not the demo reject code. */
export function isAcceptedMfaCode(code: string): boolean {
  return new RegExp(`^\\d{${MFA_CODE_LENGTH}}$`).test(code) && code !== MFA_REJECT_CODE;
}
