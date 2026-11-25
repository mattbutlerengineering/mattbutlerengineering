import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AvailabilityChangeSummary,
  ClosureDecision,
  ClosureImpact,
  DateRule,
} from "@mbe/types";
import {
  decisionsReady,
  outcomeCounts,
  toDecisions,
  withoutChoicesFor,
  type ChoiceMap,
  type GroupChoice,
} from "./close-draft.js";
import { outcomeSummary } from "./outcome-label.js";
import { refusalOf, refusalText, type Refusal, type RefusalContext } from "./step-two-refusal.js";
import { useSaveAttempts } from "./use-save-attempts.js";

/** Where a save that decides on bookings stands. */
export type DecisionsState =
  | { readonly kind: "editing" }
  | { readonly kind: "deciding" }
  | { readonly kind: "sending" }
  | { readonly kind: "refused"; readonly refusal: Refusal["kind"] }
  | { readonly kind: "saved" }
  /** `earlier`: an attempt shows in the config. `maybeSaved`: an attempt got no definite answer. */
  | { readonly kind: "settled"; readonly reason: "earlier" | "maybeSaved" };

/** What a flow's `send` is handed: the attempt's ids and one decision list per impact. */
export interface DecisionsSend {
  readonly ruleId: string;
  /** Tonight sends none and may ignore it. */
  readonly idempotencyKey: string;
  /** A row's own rule id, stable within an attempt and new after a restart. */
  readonly ruleIdFor: (rowKey: string) => string;
  readonly decisions: ClosureDecision[][];
}

export interface DecisionsSessionOptions<Out> {
  readonly rules: readonly DateRule[];
  /** Flow-owned: the impacts (one per row) and how to load them again. */
  readonly impact: {
    readonly data?: readonly ClosureImpact[];
    readonly refetch: () => Promise<unknown>;
  };
  /** Entry from a refused first send: straight into deciding, under that rule id. */
  readonly firstRuleId?: string;
  readonly send: (attempt: DecisionsSend) => Promise<Out>;
  readonly onSaved: (out: Out) => void;
  /** Flow-supplied: Close and Tonight show the winner, Add resets, Series returns to the form. */
  readonly onVersionConflict?: (refusal: Extract<Refusal, { kind: "version-conflict" }>) => void;
  readonly reload: () => void;
  readonly onLeave: () => void;
  /** Names bookings in a refused move, as the screen does. */
  readonly format?: RefusalContext["format"];
}

/**
 * One save that decides on bookings (Close, series growth, Add special date, Tonight): the choices,
 * the attempt ids, and what each refusal does next. The flow supplies how to send, where the impact
 * comes from, and its own reaction to a version conflict. `refusalOf` stays the only classifier.
 */
export function useDecisionsSession<Out>(options: DecisionsSessionOptions<Out>) {
  const { impact, firstRuleId, send, onSaved, onVersionConflict, format } = options;
  const { t } = useTranslation();
  const attempts = useSaveAttempts(options.rules, {
    firstRuleId,
    reload: options.reload,
    onLeave: options.onLeave,
  });
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [winner, setWinner] = useState<AvailabilityChangeSummary | null>(null);
  const [phase, setPhase] = useState<
    | { readonly kind: "idle" }
    | { readonly kind: "sending" }
    | { readonly kind: "refused"; readonly refusal: Refusal["kind"] }
    | { readonly kind: "saved" }
  >({ kind: "idle" });
  // Per-row ids for the attempt's key; only touched from handlers, never during render.
  const rowIds = useRef<{ key: string; ids: Map<string, string> }>({ key: "", ids: new Map() });

  const impacts = impact.data ?? [];
  const groups = impacts.flatMap((i) => i.groups);
  const ready = impacts.every((i) => decisionsReady(i.groups, choices));

  let state: DecisionsState;
  if (phase.kind === "saved") state = { kind: "saved" };
  else if (phase.kind === "sending") state = { kind: "sending" };
  else if (attempts.earlier) state = { kind: "settled", reason: "earlier" };
  else if (attempts.maybeSaved) state = { kind: "settled", reason: "maybeSaved" };
  else if (phase.kind === "refused") state = phase;
  else
    state =
      groups.length > 0 || firstRuleId !== undefined ? { kind: "deciding" } : { kind: "editing" };

  // Per-row ids hang off the attempt's key: a new key starts a new set.
  const ruleIdFor = (rowKey: string) => {
    if (rowIds.current.key !== attempts.idempotencyKey) {
      rowIds.current = { key: attempts.idempotencyKey, ids: new Map() };
    }
    const { ids } = rowIds.current;
    let id = ids.get(rowKey);
    if (!id) {
      id = crypto.randomUUID();
      ids.set(rowKey, id);
    }
    return id;
  };

  const afterEdit = (before: unknown, after: unknown) => {
    attempts.edited(before, after);
    if (phase.kind === "refused" && JSON.stringify(before) !== JSON.stringify(after)) {
      setPhase({ kind: "idle" });
      setFailure(null);
    }
  };

  const submit = async () => {
    if (state.kind !== "editing" && state.kind !== "deciding" && state.kind !== "refused") return;
    if (!ready) return;
    setFailure(null);
    setPhase({ kind: "sending" });
    attempts.record(outcomeSummary(outcomeCounts(groups, choices), t));
    try {
      const out = await send({
        ruleId: attempts.ruleId,
        idempotencyKey: attempts.idempotencyKey,
        ruleIdFor,
        decisions: impacts.map((i) => toDecisions(i.groups, choices)),
      });
      setPhase({ kind: "saved" });
      onSaved(out);
    } catch (error) {
      const refusal = refusalOf(error);
      const text = refusalText(refusal, t, format ? { groups, format } : undefined);
      if (refusal.kind === "groups-changed") {
        // The bookings changed since the Manager chose: the choices are void, and not a failure.
        setChoices({});
        setFailure(text);
        setPhase({ kind: "idle" });
        await impact.refetch().catch(() => undefined);
        return;
      }
      attempts.failed(refusal);
      setFailure(text);
      if (refusal.kind === "move-unavailable") {
        setChoices(withoutChoicesFor(groups, choices, refusal.reservationIds));
        setPhase({ kind: "idle" });
        await impact.refetch().catch(() => undefined);
        return;
      }
      if (refusal.kind === "version-conflict") {
        setWinner(refusal.winningChange);
        onVersionConflict?.(refusal);
      }
      setPhase({ kind: "refused", refusal: refusal.kind });
    }
  };

  return {
    state,
    choices,
    setChoice: (groupKey: string, choice: GroupChoice) => {
      const next = { ...choices, [groupKey]: choice };
      afterEdit(choices, next);
      setChoices(next);
    },
    attempts,
    failure,
    winner,
    submit,
    edited: afterEdit,
    leave: () => attempts.leave(state.kind === "sending"),
  };
}
