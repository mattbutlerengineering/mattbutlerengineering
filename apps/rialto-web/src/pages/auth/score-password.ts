/**
 * Pure password-quality scoring for the auth demo pages.
 *
 * Deliberately dependency-free: the demo needs honest, legible feedback — not
 * entropy estimation. Three requirements, each worth one point, plus a bonus
 * point when every requirement is met with generous length.
 */

/** Minimum acceptable password length. */
export const MIN_PASSWORD_LENGTH = 12;

/** Length at which a fully-satisfying password earns the bonus point. */
export const BONUS_LENGTH = 16;

export interface PasswordRequirements {
  /** At least {@link MIN_PASSWORD_LENGTH} characters */
  minLength: boolean;
  /** Contains both an upper- and a lower-case letter */
  mixedCase: boolean;
  /** Contains a digit or a symbol */
  numberOrSymbol: boolean;
}

export interface PasswordAssessment {
  /** 0-4: one point per satisfied requirement, +1 bonus for length >= {@link BONUS_LENGTH} when all are met */
  score: 0 | 1 | 2 | 3 | 4;
  satisfied: PasswordRequirements;
}

/** Human label for each score value, indexed by score. */
export const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Strong", "Very strong"] as const;

export function scorePassword(password: string): PasswordAssessment {
  const satisfied: PasswordRequirements = {
    minLength: password.length >= MIN_PASSWORD_LENGTH,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    numberOrSymbol: /[0-9]/.test(password) || /[^a-zA-Z0-9]/.test(password),
  };

  const base = Object.values(satisfied).filter(Boolean).length;
  const allSatisfied = base === 3;
  const score = (allSatisfied && password.length >= BONUS_LENGTH ? 4 : base) as 0 | 1 | 2 | 3 | 4;

  return { score, satisfied };
}

/** Maps a strength score onto the Meter fill variant: error → default → success. */
export function meterVariantForScore(score: number): "error" | "default" | "success" {
  if (score <= 1) return "error";
  if (score === 2) return "default";
  return "success";
}
