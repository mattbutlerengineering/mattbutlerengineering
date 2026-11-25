import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClosureAlongside, ClosureImpact, ClosureResult, DateRule } from "@mbe/types";
import { useCreateClosure, useCreateClosures } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { refusalOf } from "./step-two-refusal.js";
import { useDecisionsSession } from "./use-decisions-session.js";

/** What a Close save sent back: the outcomes (summed over several dates) and, for one, its result. */
export interface CloseSaved {
  readonly outcomes: ClosureResult["outcomes"];
  readonly result: ClosureResult | null;
}

export interface CloseSessionOptions {
  readonly venueId: string;
  readonly rules: readonly DateRule[];
  readonly version: number;
  /** One closure per date (the Several dates form) or exactly one. */
  readonly several: boolean;
  /** The impacts the dialog shows, one per closure, `undefined` while they load. */
  readonly impacts: readonly ClosureImpact[] | undefined;
  readonly refetch: () => Promise<unknown>;
  /** The closures the form describes, with ids from `idFor` (a date's own, for several). */
  readonly rulesOf: (idFor: (date: string) => string) => readonly DateRule[];
  readonly alongside?: ClosureAlongside;
  /** Set when an edit gives back dates holding cancelled guests: whether to tell them. */
  readonly tellGivenBack?: boolean;
  readonly onSaved: (saved: CloseSaved) => void;
  readonly onClose: () => void;
}

const sumOutcomes = (results: readonly ClosureResult[]): ClosureResult["outcomes"] =>
  results.reduce(
    (total, r) => ({
      cancel: total.cancel + r.outcomes.cancel,
      move: total.move + r.outcomes.move,
      keep_notify: total.keep_notify + r.outcomes.keep_notify,
      keep_silent: total.keep_silent + r.outcomes.keep_silent,
    }),
    { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 }
  );

/**
 * The decisions session of Close (ux.md F5): one closure, or one per date in a single command. The
 * dialog loads the impacts and owns the form; the session owns the choices, the attempt ids and what
 * each refusal does next. A 409 keeps Step 2 and names the change that won (`winner`).
 */
export function useCloseSession(options: CloseSessionOptions) {
  const { venueId, several, rulesOf, alongside, tellGivenBack } = options;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const refresh = useRefreshAvailability();
  const createOne = useCreateClosure();
  const createMany = useCreateClosures();
  // `closure-exists`: this attempt committed. The config reload that proves it is async, and
  // until it lands an edited choice would be a new attempt: nothing more is sent from here.
  const [committed, setCommitted] = useState(false);

  const session = useDecisionsSession<CloseSaved>({
    rules: options.rules,
    impact: { data: options.impacts, refetch: options.refetch },
    format,
    reload: refresh,
    onLeave: options.onClose,
    attemptOf: (ruleIdFor, ruleId) => {
      const rules = rulesOf((date) => (several ? ruleIdFor(date) : ruleId));
      return { ruleIds: rules.map((r) => r.id), dates: rules.map((r) => r.startsOn) };
    },
    send: async (attempt) => {
      const rules = rulesOf((date) => (several ? attempt.ruleIdFor(date) : attempt.ruleId));
      const [only] = rules;
      if (!only) throw new Error("A closure is sent from a dialog that has its dates.");
      try {
        if (several) {
          const result = await createMany.mutateAsync({
            venueId,
            idempotencyKey: attempt.idempotencyKey,
            body: {
              expectedVersion: options.version,
              items: rules.map((rule, i) => ({ rule, decisions: attempt.decisions[i] ?? [] })),
            },
          });
          return { outcomes: sumOutcomes(result.results), result: null };
        }
        const result = await createOne.mutateAsync({
          venueId,
          idempotencyKey: attempt.idempotencyKey,
          body: {
            expectedVersion: options.version,
            rule: only,
            ...(alongside ? { alongside } : {}),
            decisions: attempt.decisions[0] ?? [],
            ...(tellGivenBack !== undefined ? { tellGivenBackGuests: tellGivenBack } : {}),
          },
        });
        return { outcomes: result.outcomes, result };
      } catch (error) {
        const { kind } = refusalOf(error);
        // Either way the calendar on screen is out of date.
        if (kind === "version-conflict" || kind === "closure-exists") refresh();
        if (kind === "closure-exists") setCommitted(true);
        throw error;
      }
    },
    onSaved: options.onSaved,
  });

  const { state } = session;
  const maybeSaved = state.kind === "settled" && state.reason === "maybeSaved";
  // A save that may have gone through says so, whatever the server's sentence was, and keeps
  // saying so after an edit drops the session's own text.
  const failure =
    session.unconfirmed || (maybeSaved && session.failure === null)
      ? t("availabilitySpecial.add.maybeSaved")
      : session.failure;

  return {
    ...session,
    failure,
    submit: () => (committed ? Promise.resolve() : session.submit()),
    /** This attempt is in the config already (the reload is on its way): the button stays off. */
    committed,
    isPending: createOne.isPending || createMany.isPending,
  };
}
