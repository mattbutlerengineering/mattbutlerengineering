import { useTranslation } from "react-i18next";
import type { DepositConfig } from "@mbe/types";
import { describeCancellationPolicy, quoteDeposit } from "@mbe/cancellation-policy";
import type { CancellationPolicyDescription } from "@mbe/cancellation-policy";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";

type FreeWindow = Extract<CancellationPolicyDescription, { kind: "free-window" }>;

/**
 * The deposit's cancellation terms as data, or null when no policy is
 * configured — callers hide the policy card entirely in that case.
 *
 * `partySize` is required: late-cancellation and no-show fees are evaluated
 * against the actual charged deposit total (`quoteDeposit`), not the
 * per-person base — for `per_person` venues those two amounts differ.
 */
export function describeDepositCancellation(
  config: DepositConfig | null,
  partySize: number
): FreeWindow | null {
  if (!config || config.freeCancellationHours == null) return null;
  const description = describeCancellationPolicy({
    depositAmountCents: quoteDeposit(config, partySize),
    freeCancellationHours: config.freeCancellationHours,
    lateCancellationFeePercent: config.lateCancellationFeePercent,
    noShowFeePercent: config.noShowFeePercent,
  });
  return description.kind === "free-window" ? description : null;
}

/**
 * The cancellation terms in the active locale, with fee amounts in the
 * deposit's currency. Null when no policy is configured.
 */
export function useDepositCancellationTerms(
  config: DepositConfig | null,
  partySize: number
): string | null {
  const { t } = useTranslation();
  const { formatMoney } = useVenueFormat({
    ianaTimezone: "",
    currencyCode: config?.currency ?? "usd",
  });
  const terms = describeDepositCancellation(config, partySize);
  if (!terms) return null;
  return t("bookingWidget.cancellationTerms", {
    count: terms.freeHours,
    lateFeePercent: terms.lateFeePercent,
    lateFee: formatMoney(terms.lateFeeAmountCents),
    noShowFeePercent: terms.noShowFeePercent,
    noShowFee: formatMoney(terms.noShowFeeAmountCents),
  });
}
