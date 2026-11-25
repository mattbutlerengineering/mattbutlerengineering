import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import type { ClosureImpact, DateRule } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useCreateClosures, usePreviewClosureImpacts } from "../../hooks/useClosures.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { refusalOf } from "./step-two-refusal.js";
import { useDecisionsSession } from "./use-decisions-session.js";

/** One closure the sheet saves: its row and the rule built from it. */
interface AddDatesItem {
  readonly rowKey: string;
  readonly rule: DateRule;
}

export interface AddDatesSessionOptions {
  readonly venueId: string;
  readonly rules: readonly DateRule[];
  readonly version: number;
  /** The rows' closures, with the attempt's rule ids: they hang off the key the session owns. */
  readonly itemsOf: (ruleIdFor: (rowKey: string) => string) => readonly AddDatesItem[];
  readonly dateCount: number;
  readonly savedTitle?: string;
  /** The closures were saved (not cancelled, not refused), called once before the sheet closes. */
  readonly onSaved?: () => void;
  readonly reload: () => void;
  readonly onClose: () => void;
  /** Someone saved first, or the attempt already committed: reload the config. */
  readonly onStale: () => void;
  /** The plan is stale: the sheet goes back to its form. */
  readonly onBackToForm: () => void;
}

/**
 * The decisions session of + Add special date (ux.md F6): every row saves in one closure-command
 * transaction. The impacts (one per row) are the sheet's to load; the session owns the choices, the
 * attempt ids and what each refusal does next. The sheet's wording of a failure is composed here.
 */
export function useAddDatesSession(options: AddDatesSessionOptions) {
  const { venueId, itemsOf, dateCount, savedTitle, onSaved, onStale, onBackToForm } = options;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const previewImpacts = usePreviewClosureImpacts();
  const createClosures = useCreateClosures();
  const [impacts, setImpacts] = useState<readonly ClosureImpact[]>([]);
  // This sheet's key already committed (`closure-exists`): nothing more is sent from it.
  const [savedEarlier, setSavedEarlier] = useState(false);
  const [lastRefusal, setLastRefusal] = useState<string | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);
  // Asking for the bookings (Next) failed: no session state to say so.
  const [previewFailed, setPreviewFailed] = useState(false);
  // A lookup has failed at least once: a sheet opened by a holiday then stays up for the retry.
  const [lookupFailed, setLookupFailed] = useState(false);

  const load = async (): Promise<readonly ClosureImpact[]> =>
    previewImpacts.mutateAsync({
      venueId,
      rules: itemsOf(session.ruleIdFor).map((i) => i.rule),
    });

  const session = useDecisionsSession({
    rules: options.rules,
    impact: {
      data: impacts,
      refetch: async () => {
        // What Step 2 proposed no longer matches what the save does: ask again.
        try {
          setImpacts(await load());
        } catch {
          setReloadFailed(true);
        }
      },
    },
    format,
    reload: options.reload,
    onLeave: options.onClose,
    attemptOf: (ruleIdFor) => {
      const items = itemsOf(ruleIdFor);
      return {
        ruleIds: items.map((item) => item.rule.id),
        dates: items.map((item) => item.rule.startsOn),
      };
    },
    send: async (attempt) => {
      setLastRefusal(null);
      setReloadFailed(false);
      try {
        return await createClosures.mutateAsync({
          venueId,
          idempotencyKey: attempt.idempotencyKey,
          body: {
            expectedVersion: options.version,
            items: itemsOf(attempt.ruleIdFor).map((item, i) => ({
              rule: item.rule,
              decisions: attempt.decisions[i] ?? [],
            })),
          },
        });
      } catch (error) {
        const refused = refusalOf(error);
        setLastRefusal(refused.kind);
        if (refused.kind === "closure-exists") {
          onStale();
          setSavedEarlier(true);
        }
        throw error;
      }
    },
    onSaved: (result) => {
      const notified = result.results.reduce(
        (n, r) => n + r.outcomes.cancel + r.outcomes.move + r.outcomes.keep_notify,
        0
      );
      const savedCount = t(
        notified > 0 ? "availabilitySpecial.add.savedNotified" : "availabilitySpecial.add.saved",
        { count: dateCount, notified }
      );
      const title =
        savedTitle === undefined
          ? savedCount
          : notified > 0
            ? t("availabilitySpecial.holidays.savedNotified", {
                title: savedTitle,
                count: notified,
              })
            : savedTitle;
      const only = result.results.length === 1 ? result.results[0] : undefined;
      if (savedTitle !== undefined && only && notified === 0 && onSaved === undefined) {
        // A holiday closed in one step is taken back from its toast. Not offered when guests were
        // told (the server refuses it), nor when something runs after the save (`onSaved` tidies
        // what the closure replaced, so a revert of the closure alone would be wrong or stale);
        // several dates, and a changed decision, confirm first instead.
        offerUndo({ venueId, title, saved: { version: only.version, changeId: only.changeId } });
      } else {
        toast({ title, variant: "success" });
      }
      onSaved?.();
      options.onClose();
    },
    onVersionConflict: () => {
      // Reload the config, and ask again from it: the impact and the version are both stale.
      onStale();
      setImpacts([]);
      onBackToForm();
    },
  });

  const impactError = t("availability.close.impactError");
  const failureLines = (): readonly string[] => {
    if (previewFailed) return [impactError];
    const text = session.failure;
    const reload = reloadFailed ? [impactError] : [];
    if (text !== null && lastRefusal === "closure-exists") return [text];
    if (text !== null && lastRefusal === "groups-changed") return [text, ...reload];
    // Kept after an edit too: the session drops its text then, but the save may still have gone through.
    if (session.state.kind === "settled" && session.state.reason === "maybeSaved")
      return [t("availabilitySpecial.add.maybeSaved")];
    if (text === null) return [];
    return [text, t("availabilitySpecial.add.nothingCancelled"), ...reload];
  };

  return {
    ...session,
    impacts,
    /** Asks for the bookings each row's closure would affect; `previewFailed` if it cannot. */
    preview: async () => {
      setPreviewFailed(false);
      try {
        const found = await load();
        setImpacts(found);
        session.reset();
        return found;
      } catch {
        setPreviewFailed(true);
        setLookupFailed(true);
        return null;
      }
    },
    submit: (found?: readonly ClosureImpact[]) => {
      setPreviewFailed(false);
      return session.submit(found);
    },
    /** The save is in the config already: the button stays off. */
    savedEarlier,
    lookupFailed,
    failureLines: failureLines(),
    busy: previewImpacts.isPending || createClosures.isPending,
  };
}
