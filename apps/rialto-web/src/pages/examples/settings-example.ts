/**
 * Profile validation for the settings example. Framework-free so the rules
 * can be unit-tested without React.
 */

export interface ProfileDraft {
  fullName: string;
  email: string;
}

export interface ProfileErrors {
  fullName?: string;
  email?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!draft.fullName.trim()) errors.fullName = "Full name is required.";
  const email = draft.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  return errors;
}
