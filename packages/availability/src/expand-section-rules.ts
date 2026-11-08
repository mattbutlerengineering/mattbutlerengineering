import type { DateRule } from "@mbe/types";

/**
 * A section closure remembers its section, not its tables (ADR-032): before the
 * engine reads the rules, each rule that names a section gets that section's
 * tables as of now. A section the membership does not know blocks nothing.
 * Pure; returns new rules, so expanding twice gives the same result.
 */
export function expandSectionRules(
  rules: readonly DateRule[],
  membership: ReadonlyMap<string, readonly string[]>
): DateRule[] {
  return rules.map((rule) =>
    rule.sectionId == null
      ? rule
      : { ...rule, tableIds: [...(membership.get(rule.sectionId) ?? [])] }
  );
}
