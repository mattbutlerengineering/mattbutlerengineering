import { useSyncExternalStore } from "react";
import type { TFunction } from "i18next";
import { AvailabilityConfigProblemSchema, type StrandedReservation } from "@mbe/types";
import { revertErrorText } from "./revert-error.js";

/**
 * The bookings a refused revert would strand, for the page's dialog to list. A toast cannot hold
 * up to 200 links, and Undo can be pressed after the surface that offered it has unmounted, so the
 * list lives here, outside any one surface, and the page shows it.
 */
let hosts = 0;
let shown: readonly StrandedReservation[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Marks a dialog mounted to show the list; the returned function marks it gone (once). */
export function registerStrandedRevertHost(): () => void {
  hosts += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hosts -= 1;
    if (hosts === 0 && shown.length > 0) {
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
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  return problem.success && problem.data.code === "stranded-bookings"
    ? (problem.data.reservations ?? [])
    : [];
}

interface ToastInput {
  readonly title: string;
  readonly variant: "error";
  readonly duration: number;
}

/**
 * Reports a refused revert: the stranded bookings go to the page's dialog; any other refusal, or a
 * page with no dialog mounted (the Manager has left it), gets its sentence in a toast.
 */
export function reportRevertFailure(
  error: unknown,
  t: TFunction,
  toast: (input: ToastInput) => unknown
) {
  const reservations = strandedReservations(error);
  if (reservations.length > 0 && hosts > 0) {
    shown = reservations;
    emit();
    return;
  }
  toast({ title: revertErrorText(error, t), variant: "error", duration: 8000 });
}
