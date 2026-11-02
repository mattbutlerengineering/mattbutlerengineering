import { useTranslation } from "react-i18next";
import { Alert, Text } from "@mattbutlerengineering/rialto";
import { alreadyClosed } from "@mbe/availability";
import type { DateRule, VenueService } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { overlapLines } from "./closure-overlap-text.js";

export interface AlreadyClosedNoticeProps {
  readonly rules: readonly DateRule[];
  /** The closure as the form stands, `null` while it is incomplete. */
  readonly draft: DateRule | null;
  readonly services: readonly VenueService[];
  /** Today on the venue clock: an earlier date is not worth warning about. */
  readonly today: string;
}

/**
 * Warns that some of a draft's dates are shut already, and by what (#8006). It never blocks: a
 * second closure can be meant to outlast the first, and only the Manager knows.
 */
export function AlreadyClosedNotice({ rules, draft, services, today }: AlreadyClosedNoticeProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const found = draft ? alreadyClosed(rules, draft, today) : null;
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
