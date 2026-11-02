import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import type { changeSummaryText } from "./change-summary-text.js";

type ChangeSummaryText = typeof changeSummaryText;

/**
 * The wording of a change's code lives in its own chunk, loaded only when a refusal names a change
 * that has one: the Close dialog and Tonight panel are on the emergency path and stay small. Until
 * it arrives, or if it never does, the stored English `summary` is shown, so a failed chunk adds
 * no failure state to the save.
 */
function useChangeSummaryText(coded: boolean): ChangeSummaryText | null {
  const [text, setText] = useState<ChangeSummaryText | null>(null);
  useEffect(() => {
    if (!coded) return;
    let live = true;
    import("./change-summary-text.js").then(
      (m) => {
        if (live) setText(() => m.changeSummaryText);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [coded]);
  return text;
}

/** "Changed first by a teammate: Closed Thu Dec 24 · 12:15 PM" (who, what, when). */
export function useWinningChangeText(winningChange: AvailabilityChangeSummary | null): string {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { user } = useAuth();
  const worded = useChangeSummaryText(Boolean(winningChange?.detail));
  if (!winningChange) return t("availability.conflict.unknown");
  return t("availability.conflict.winning", {
    who:
      user?.id === winningChange.actorId
        ? t("availability.history.you")
        : t("availability.history.teammate"),
    summary: worded ? worded(winningChange, format, t) : winningChange.summary,
    when: format.formatInstant(winningChange.at, { hour: "numeric", minute: "2-digit" }),
  });
}
