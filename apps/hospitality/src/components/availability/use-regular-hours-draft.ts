import { useId, useRef, useState, type FocusEvent } from "react";
import type { AvailabilityConfigSaveResult, AvailabilityConfigState } from "@mbe/types";
import type { SaveReach } from "./EditorSaveBar.js";
import { focusFirstInvalid } from "./quick-setup-field-helpers.js";
import { useRefusedPress } from "./use-refused-press.js";
import { useRegularWeekEdit } from "./use-regular-week-edit.js";

export interface RegularHoursDraftInput {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock: Starting begins here, and no earlier date can be picked. */
  readonly today: string;
  readonly onStale: () => void;
  readonly offerUndo: (title: string, saved: AvailabilityConfigSaveResult) => void;
  /** Saved from the save bar (not from the leave prompt, whose route change goes ahead itself). */
  readonly onSaved: (saved: AvailabilityConfigSaveResult) => void;
  /** The regular hours the draft is based on are gone and the Manager chose to discard. */
  readonly onDiscard: () => void;
}

/**
 * Regular hours' editing state (availability-hub ux.md, "Regular hours"): the weekly draft from
 * `useRegularWeekEdit` with Starting defaulting to today, and when its problems are said. A new
 * "Different hours" block has no days yet, which is not an error to open with: it is said once
 * Save is pressed or a field of the block is left. Every save goes through the hook's `submit`,
 * so the page writes what the week panel and Change regular week wrote.
 */
export function useRegularHoursDraft(input: RegularHoursDraftInput) {
  const { venueId, state, today, onStale, offerUndo, onSaved, onDiscard } = input;
  const scopeId = useId();
  // The leave prompt's Save: its route change goes ahead by itself, so no return to the hub.
  const viaPrompt = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const edit = useRegularWeekEdit({
    venueId,
    state,
    onStale,
    defaultStart: today,
    offerUndo,
    onGone: onDiscard,
    onSaved: (saved) => {
      setDone(true);
      if (!viaPrompt.current) onSaved(saved);
    },
  });
  const { issues, block, blocked } = edit;
  const shown = revealed ? issues : issues.filter((issue) => issue.code !== "block_days_required");
  // Everything wrong is still unsaid: the preview and the bar stay quiet about it.
  const quiet = block === null && shown.length === 0 && issues.length > 0;
  // Refused for a problem in the form, not for a conflict or a missing service.
  const refused = blocked && block === null && issues.length > 0;
  const { refuse } = useRefusedPress({
    onRefused: () => setRevealed(true),
    focusFirstProblem: () => focusFirstInvalid(shown, scopeId),
  });
  const save = () => (refused ? refuse() : void edit.submit());
  const saveAndLeave = async (): Promise<boolean> => {
    if (blocked) {
      if (refused) refuse();
      return false;
    }
    // A saved draft keeps the guard mounted until the route change goes through (the page is gone
    // by then); a refused one keeps `unsaved`, so the guard is still there to answer.
    viaPrompt.current = true;
    setLeaving(true);
    const saved = await edit.submit();
    viaPrompt.current = false;
    if (!saved) setLeaving(false);
    return saved;
  };
  const leftBlock = (event: FocusEvent) => {
    const fieldset = (event.target as HTMLElement).closest("[data-hours-block]");
    if (fieldset && !fieldset.contains(event.relatedTarget as Node | null)) setRevealed(true);
  };
  const reach: SaveReach | null =
    edit.startsOn !== null && edit.startsOn !== today
      ? { kind: "from", date: edit.startText }
      : null;
  return {
    ...edit,
    scopeId,
    shown,
    quiet,
    hasProblem: refused && !quiet,
    // A reason that is not a field's problem (a conflict, no service left); those are the form's.
    blockedReason: block === null ? null : edit.blockedText,
    reach,
    unsaved: edit.dirty && !done,
    guarded: (edit.dirty && !done) || leaving,
    save,
    saveAndLeave,
    leftBlock,
  };
}
