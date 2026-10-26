import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";

/** "Changed first by a teammate: Closed Thu Dec 24 · 12:15 PM" (who, what, when). */
export function useWinningChangeText(winningChange: AvailabilityChangeSummary | null): string {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { user } = useAuth();
  if (!winningChange) return t("availability.conflict.unknown");
  return t("availability.conflict.winning", {
    who:
      user?.id === winningChange.actorId
        ? t("availability.history.you")
        : t("availability.history.teammate"),
    summary: winningChange.summary,
    when: format.formatInstant(winningChange.at, { hour: "numeric", minute: "2-digit" }),
  });
}
