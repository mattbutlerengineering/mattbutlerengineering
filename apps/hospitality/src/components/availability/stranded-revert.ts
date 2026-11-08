import { useSyncExternalStore } from "react";
import type { TFunction } from "i18next";
import type { StrandedReservation } from "@mbe/types";
import { availabilityProblemOf } from "./conflict-problem.js";
import { revertErrorText } from "./revert-error.js";

/**
 * The bookings a refused revert would strand, for the page's dialog to list. A toast cannot hold
 * up to 200 links, and Undo can be pressed after the surface that offered it has unmounted, so the
 * list lives here, outside any one surface, and the page shows it.
 */
let hostVenues: readonly string[] = [];
let shown: readonly StrandedReservation[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Marks a dialog mounted to show the list for the venue the page is on; the returned function
 * marks it gone (once). The list shows only for that venue: its links open the selected venue's
 * timeline and its times use that venue's clock.
 */
export function registerStrandedRevertHost(venueId: string): () => void {
  hostVenues = [...hostVenues, venueId];
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const at = hostVenues.indexOf(venueId);
    hostVenues = hostVenues.filter((_, i) => i !== at);
    // A list shown for the venue the host left (or for a page that has gone) is not for the next.
    if (shown.length > 0) {
      shown = [];
      emit();
    }
  };
}

export function dismissStrandedRevert() {
  shown = [];
  emit();
}

export const useStrandedRevert = (): readonly StrandedReservation[] =>
  useSyncExternalStore(subscribe, () => shown);

function strandedReservations(error: unknown): readonly StrandedReservation[] {
  const problem = availabilityProblemOf(error);
  return problem?.code === "stranded-bookings" ? (problem.reservations ?? []) : [];
}

interface ToastInput {
  readonly title: string;
  readonly variant: "error";
  readonly duration: number;
}

/**
 * Reports a refused revert of a change in `venueId`: the stranded bookings go to the page's dialog.
 * Any other refusal gets its sentence in a toast, and so does one with no dialog mounted for that
 * venue: the Manager has left the Availability page, or switched venue (a link cannot name one).
 */
export function reportRevertFailure(
  error: unknown,
  t: TFunction,
  toast: (input: ToastInput) => unknown,
  venueId: string
) {
  const reservations = strandedReservations(error);
  if (reservations.length > 0 && hostVenues.includes(venueId)) {
    shown = reservations;
    emit();
    return;
  }
  toast({ title: revertErrorText(error, t), variant: "error", duration: 8000 });
}
