import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import type { ClosureAlongside, ClosureImpact, DateRule } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useCreateClosure } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { growthAttempt } from "./series-edit.js";
import { refusalOf, refusalText } from "./step-two-refusal.js";
import { useDecisionsSession } from "./use-decisions-session.js";

/** A series edit that closes new dates: the plan, the bookings it would close, the version it saw. */
export interface SeriesGrowth {
  readonly rule: DateRule;
  readonly alongside: ClosureAlongside;
  readonly impact: ClosureImpact;
  /**
   * The version the plan was built on, never the latest: a plan older than the config has to get
   * a 409, or it overwrites what it never saw.
   */
  readonly expectedVersion: number;
}

export interface SeriesGrowthSessionOptions {
  readonly venueId: string;
  readonly rules: readonly DateRule[];
  /** Null while the form is showing: there is nothing to decide yet. */
  readonly growth: SeriesGrowth | null;
  /** A group's bookings changed: load the impact again and hand it back in `growth`. */
  readonly refetch: () => Promise<void>;
  /** Reloads the config: leaving after a save leaves the calendar stale otherwise. */
  readonly reload: () => void;
  readonly onLeave: () => void;
  /**
   * Someone saved first. The edit was built from a config that is gone, so it cannot be sent
   * again: the caller reloads the config and returns to the form with `message`.
   */
  readonly onStale: (message: string) => void;
}

/**
 * The decisions session of a series edit (ux.md F-SER step 4): one closure-command save that
 * replaces the series and cancels, refunds and notifies exactly as for a new closure. It lives in
 * `SeriesEditDialog`, so going Back from Step 2 cannot forget a save that may have gone through.
 */
export function useSeriesGrowthSession(options: SeriesGrowthSessionOptions) {
  const { venueId, growth, onStale } = options;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const refresh = useRefreshAvailability();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync } = useCreateClosure();
  // This attempt's key already committed (`closure-exists`): nothing more is sent from here.
  const [savedEarlier, setSavedEarlier] = useState(false);
  const firstDate = growth?.impact.groups[0]?.date ?? growth?.rule.startsOn ?? "";

  const session = useDecisionsSession({
    rules: options.rules,
    impact: { data: growth ? [growth.impact] : undefined, refetch: options.refetch },
    format,
    reload: options.reload,
    onLeave: options.onLeave,
    send: async (attempt) => {
      if (!growth) throw new Error("A series edit is sent from Step 2, which needs a plan.");
      try {
        return await mutateAsync({
          venueId,
          idempotencyKey: attempt.idempotencyKey,
          body: {
            expectedVersion: growth.expectedVersion,
            ...growthAttempt({ rule: growth.rule, alongside: growth.alongside }, attempt.ruleId),
            decisions: attempt.decisions[0] ?? [],
          },
        });
      } catch (error) {
        // Either way the calendar on screen is out of date.
        const { kind } = refusalOf(error);
        if (kind === "version-conflict" || kind === "closure-exists") refresh();
        if (kind === "closure-exists") setSavedEarlier(true);
        throw error;
      }
    },
    onSaved: (result) => {
      const { cancel, move, keep_notify } = result.outcomes;
      const notified = cancel + move + keep_notify;
      if (notified > 0) {
        // Told guests: History cannot revert it, so the toast offers no Undo.
        toast({
          title: t("availability.close.toast.notified", {
            date: format.formatCalendarDate(firstDate, {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
            count: notified,
          }),
          variant: "success",
        });
      } else {
        offerUndo({ venueId, saved: result, title: t("availabilitySpecial.series.savedToast") });
      }
      options.onLeave();
    },
    onVersionConflict: (refusal) => onStale(refusalText(refusal, t)),
  });

  return {
    ...session,
    /** The save is in the config already: the button stays off. */
    savedEarlier,
    reset: () => {
      setSavedEarlier(false);
      session.reset();
    },
  };
}

export type SeriesGrowthSession = ReturnType<typeof useSeriesGrowthSession>;
