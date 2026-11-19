export interface KnownViolation {
  readonly directive: string;
  readonly sourceFileIncludes: string;
}

/**
 * Violations that exist today, standalone, and are named so the specs allow exactly them.
 * Empty: the `eval` block from hospitality's json-render-vendor chunk is unexplained until WO-02
 * records whether it is pre-existing. WO-02 adds an entry only if it proves pre-existing.
 */
export const KNOWN_PRE_EXISTING_CSP_VIOLATIONS: ReadonlyArray<KnownViolation> = [];

export function scriptSrc(policy: string): string {
  return (
    policy
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src ")) ?? ""
  );
}

export function weakensScripts(policy: string): boolean {
  return /'unsafe-eval'|'unsafe-inline'/.test(scriptSrc(policy));
}

/** The violations that are not explicitly named as pre-existing. */
export function unexpectedViolations<T extends Record<string, unknown>>(
  found: ReadonlyArray<T>,
  known: ReadonlyArray<KnownViolation> = KNOWN_PRE_EXISTING_CSP_VIOLATIONS
): T[] {
  return found.filter(
    (v) =>
      !known.some(
        (k) =>
          v["directive"] === k.directive && String(v["source"] ?? "").includes(k.sourceFileIncludes)
      )
  );
}
