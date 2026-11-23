import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { ClosureSummary } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { formatCurrencyFromCents } from "../../utils/format.js";
import { refundFailureLabel } from "./special-dates.js";

/**
 * What became of the bookings a closure touched, as lines under its row (ux.md "Closures and
 * pauses"): the sent, rebooked and unreachable counts, then the refunds that failed or wait.
 */
export function ClosureOutcomes({ summary }: { readonly summary: ClosureSummary | null }) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  if (summary === null) return null;
  const failures = summary.refundFailures;
  return (
    <>
      {summary.total > 0 && (
        <Text variant="caption" color="secondary">
          {t("availabilitySpecial.counts", {
            sent: summary.sent,
            rebooked: summary.rebooked,
            unreachable: summary.unreachable,
          })}
        </Text>
      )}
      {summary.refundFailed > 0 && (
        <Text variant="caption" color="error">
          {failures.length > 0
            ? t("availabilitySpecial.refundFailedNamed", {
                names: failures
                  .map((failure) =>
                    refundFailureLabel(
                      failure,
                      (cents, currency) => formatCurrencyFromCents(cents, currency, format.locale),
                      t("availabilitySpecial.callList.unnamed")
                    )
                  )
                  .join(", "),
              })
            : t("availabilitySpecial.refundFailed", { count: summary.refundFailed })}
        </Text>
      )}
      {summary.refundFailed === 0 && summary.refundPending > 0 && (
        <Text variant="caption" color="secondary">
          {t("availabilitySpecial.refundPending", { count: summary.refundPending })}
        </Text>
      )}
    </>
  );
}
