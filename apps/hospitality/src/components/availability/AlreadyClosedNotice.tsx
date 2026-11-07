import { useTranslation } from "react-i18next";
import { Alert, Text } from "@mattbutlerengineering/rialto";
import { alreadyClosed } from "@mbe/availability";
import type { ClosedByRule, ClosureOverlap, DateRule, VenueService } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { overlapLines } from "./closure-overlap-text.js";

export interface AlreadyClosedNoticeProps {
  readonly rules: readonly DateRule[];
  /** The closure as the form stands, `null` while it is incomplete; one per date for several dates. */
  readonly draft: DateRule | readonly DateRule[] | null;
  readonly services: readonly VenueService[];
  /** Today on the venue clock: an earlier date is not worth warning about. */
  readonly today: string;
}

/** The closures that shut any of the drafts, each once with every date it shuts. */
function overlapOf(
  rules: readonly DateRule[],
  draft: DateRule | readonly DateRule[] | null,
  today: string
): ClosureOverlap | null {
  if (!draft) return null;
  if (!Array.isArray(draft)) return alreadyClosed(rules, draft as DateRule, today);
  const all = (draft as readonly DateRule[]).map((d) => alreadyClosed(rules, d, today));
  const by = new Map<string, ClosedByRule>();
  for (const found of all) {
    for (const rule of found.by) {
      const seen = by.get(rule.ruleId);
      by.set(
        rule.ruleId,
        seen ? { ...seen, dates: [...new Set([...seen.dates, ...rule.dates])].sort() } : rule
      );
    }
  }
  return { everyDate: all.length > 0 && all.every((f) => f.everyDate), by: [...by.values()] };
}

/**
 * Warns that some of a draft's dates are shut already, and by what (#8006). It never blocks: a
 * second closure can be meant to outlast the first, and only the Manager knows.
 */
export function AlreadyClosedNotice({ rules, draft, services, today }: AlreadyClosedNoticeProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const found = overlapOf(rules, draft, today);
  if (!found || found.by.length === 0) return null;
  return (
    <Alert
      variant="warning"
      title={t(
        found.everyDate
          ? "availability.closureOverlap.alreadyTitle"
          : "availability.closureOverlap.alreadySomeTitle"
      )}
    >
      {overlapLines(found, "already", services, t, format).map((line) => (
        <Text key={line}>{line}</Text>
      ))}
      <Text>{t("availability.closureOverlap.alreadyHint")}</Text>
    </Alert>
  );
}
