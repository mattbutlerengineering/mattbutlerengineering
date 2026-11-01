import { useState } from "react";
import type { DateRule } from "@mbe/types";
import { useDiscardGuard } from "./use-discard-guard.js";

/** A save that was sent: its key, its rule ids and, as text, the outcomes it chose. */
export interface TriedAttempt {
  readonly key: string;
  readonly ruleIds: readonly string[];
  readonly summary: string;
}

const newAttempt = (ruleId: string = crypto.randomUUID()) => ({
  ruleId,
  idempotencyKey: crypto.randomUUID(),
});

export interface SaveAttemptsOptions {
  /** The first attempt's rule id, when the rule already has one (a Tonight close-early). */
  readonly firstRuleId?: string;
  /** Reloads the config: leaving after a save leaves the calendar stale otherwise. */
  readonly reload: () => void;
  readonly onLeave: () => void;
}

/**
 * The attempts of one save that decides on bookings (Close, series growth, Add special date,
 * Tonight). A response can be lost after the save committed, and the server replays a retry of the
 * same attempt as its first result. So:
 *
 * - The same request again keeps its rule id and key, and the replay tells the truth.
 * - A changed request after a failure is a new attempt. The stale expected version then answers
 *   honestly (a 409) instead of replaying the old result as if the change had applied.
 * - Once any attempt shows up in the config (`earlier`), nothing more is saved, and its choices
 *   are what applied.
 * - Leaving after a save was sent warns that it may have gone through, and reloads.
 */
export function useSaveAttempts(rules: readonly DateRule[], options: SaveAttemptsOptions) {
  const { firstRuleId, reload, onLeave } = options;
  const [attempt, setAttempt] = useState(() => newAttempt(firstRuleId));
  const [tried, setTried] = useState<readonly TriedAttempt[]>([]);
  const [failedSave, setFailedSave] = useState(false);
  const earlier = tried.find((a) => rules.some((r) => a.ruleIds.includes(r.id)));

  const finish = () => {
    if (tried.length > 0) reload();
    onLeave();
  };
  const guard = useDiscardGuard<null>(() => finish());

  const restart = (ruleId?: string) => {
    setAttempt(newAttempt(ruleId));
    setFailedSave(false);
  };

  return {
    ...attempt,
    tried,
    earlier,
    restart,
    finish,
    setDirty: guard.setDirty,
    /** A choice or field moved from `before` to `after`: after a failure, that is a new attempt. */
    edited: (before: unknown, after: unknown) => {
      if (failedSave && JSON.stringify(before) !== JSON.stringify(after)) restart();
    },
    /**
     * Call before sending. One rule id can be sent more than once (a refused send keeps it, and
     * the Manager may then choose differently), and the send that commits is the last one.
     */
    record: (summary: string, ruleIds: readonly string[] = [attempt.ruleId]) => {
      const sent = { key: attempt.idempotencyKey, ruleIds, summary };
      setTried((all) => [...all.filter((a) => a.key !== sent.key), sent]);
    },
    /** The save failed and may have committed: leaving is no longer "nothing has been closed". */
    failed: () => {
      setFailedSave(true);
      guard.setDirty(true);
    },
    /** Escape during a save would close the dialog while the save still commits. */
    leave: (busy = false) => {
      if (busy) return;
      // Nothing to discard once it is saved: the question would be false.
      if (earlier) finish();
      else guard.request(null);
    },
    asking: guard.pending !== null,
    confirmLeave: guard.confirmDiscard,
    keepEditing: guard.keepEditing,
  };
}

export type SaveAttempts = ReturnType<typeof useSaveAttempts>;
