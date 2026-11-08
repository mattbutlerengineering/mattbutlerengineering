import {
  AvailabilityConfigProblemSchema,
  type AvailabilityChangeSummary,
  type AvailabilityConfigProblem,
} from "@mbe/types";

export type Conflict =
  /** Someone saved first; `winningChange` is `null` when the server recorded none. */
  | { readonly code: "version-conflict"; readonly winningChange: AvailabilityChangeSummary | null }
  /** This attempt id already committed (a response was lost). */
  | { readonly code: "closure-exists" };

/** The availability-config problem an API error carries, or null when it carries none. */
export function availabilityProblemOf(error: unknown): AvailabilityConfigProblem | null {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  return problem.success ? problem.data : null;
}

/** The 422 a closure save gets when a group's bookings changed since the Manager chose. */
export function isDecisionRequired(error: unknown): boolean {
  return availabilityProblemOf(error)?.code === "decision-required";
}

/** The 409 the closure and Tonight endpoints answer with, or `null` for any other failure. */
export function conflictOf(error: unknown): Conflict | null {
  const problem = availabilityProblemOf(error);
  if (problem?.code === "version-conflict") {
    return { code: "version-conflict", winningChange: problem.winningChange ?? null };
  }
  return problem?.code === "closure-exists" ? { code: "closure-exists" } : null;
}
