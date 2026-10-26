import { AvailabilityConfigProblemSchema, type AvailabilityChangeSummary } from "@mbe/types";

export type Conflict =
  /** Someone saved first; `winningChange` is `null` when the server recorded none. */
  | { readonly code: "version-conflict"; readonly winningChange: AvailabilityChangeSummary | null }
  /** This attempt id already committed (a response was lost). */
  | { readonly code: "closure-exists" };

/** The 409 the closure and Tonight endpoints answer with, or `null` for any other failure. */
export function conflictOf(error: unknown): Conflict | null {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  if (!problem.success) return null;
  if (problem.data.code === "version-conflict") {
    return { code: "version-conflict", winningChange: problem.data.winningChange ?? null };
  }
  return problem.data.code === "closure-exists" ? { code: "closure-exists" } : null;
}
