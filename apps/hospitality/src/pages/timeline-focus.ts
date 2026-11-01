import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Reservation } from "@mbe/types";
// By path, not the barrel: TimelinePage.test.tsx mocks the barrel wholesale.
import { RESERVATION_EDIT_TEST_ID } from "../components/timeline/seat-guest.js";
import type { FocusTarget } from "../hooks/useFocusAfter.js";
import type { Viewport } from "../hooks/useViewport.js";

/** Wraps the phone and tablet details surfaces: where focus goes while one of them is open. */
export const DETAILS_SURFACE_TEST_ID = "reservation-details-surface";

/** The desktop surface, beside the grid. */
export const DETAILS_SIDEBAR_TEST_ID = "reservation-detail-sidebar";

const SURFACE_TARGET: FocusTarget = { kind: "firstIn", testId: DETAILS_SURFACE_TEST_ID };

/** The grid block's test id — `useFocusAfter`'s target after a mutation lands on a party. */
export function blockTarget(reservationId: string): FocusTarget {
  return { kind: "testId", testId: `reservation-block-${reservationId}` };
}

/** The details surface as it stands now. Read through a ref by anything that has awaited a response. */
export interface SurfaceState {
  /** The reservation the surface is showing, whichever form it takes. */
  readonly openId: string | null;
  /** Phone and tablet show it as a modal Drawer, so what is behind it is out of reach. */
  readonly modal: boolean;
  /** A dialog held the surface in its old form, and the one its buttons are in is about to go. */
  readonly changingForm: boolean;
  /**
   * Counts the times the dialogs were closed because their party left the surface. Nothing else can
   * close a dialog mid-save, so a send that sees this change has lost the dialog that would show its
   * failure, even if the same party is back on the surface.
   */
  readonly dialogEpoch: number;
}

function insideSurface(element: HTMLElement): boolean {
  return (
    document.querySelector(`[data-testid="${DETAILS_SURFACE_TEST_ID}"]`)?.contains(element) ?? false
  );
}

/**
 * Where focus goes when a dialog closes: its opener while that is still usable, else the surface
 * (modal) or the given fallback. A modal surface never hands focus to what is behind it.
 */
export function returnFocusTarget(
  surface: SurfaceState,
  opener: HTMLElement | null,
  fallback: FocusTarget | null
): FocusTarget | null {
  const usable =
    opener?.isConnected && !surface.changingForm && (!surface.modal || insideSurface(opener));
  if (opener && usable) return { kind: "element", element: opener };
  return surface.modal ? SURFACE_TARGET : fallback;
}

/** Where focus goes when a walk-in has been seated: the new reservation opens in the surface. */
export function walkInFocusTarget(viewport: Viewport, reservationId: string): FocusTarget {
  return viewport === "desktop" ? blockTarget(reservationId) : SURFACE_TARGET;
}

/**
 * The clicked button when the surface passes it; otherwise whatever holds focus. `body` means
 * nothing held it (a click that did not focus its button): no opener to return to.
 */
export function captureOpener(clicked?: HTMLElement): HTMLElement | null {
  if (clicked) return clicked;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

const byTestId = (testId: string) => document.querySelector(`[data-testid="${testId}"]`);

/** Nothing holds focus. The usual case for a sender, whose button went disabled while it waited. */
const focusIsLoose = () => !document.activeElement || document.activeElement === document.body;

const focusIsInSurface = () =>
  [DETAILS_SURFACE_TEST_ID, DETAILS_SIDEBAR_TEST_ID].some((testId) =>
    byTestId(testId)?.contains(document.activeElement)
  );

/**
 * Where focus goes when a Seat Guest response lands, if anywhere. The Host may have moved on while
 * it was in flight: unless focus is loose or still in the surface that sent it, it stays where they
 * took it, and with another party on the surface it stays regardless. A modal surface stays open
 * after seating, and keys on a block behind it would switch the party, so Edit (not the first
 * control: the refetch removes Seat Guest, which may be first). Else the block, if it is on the page:
 * a request left waiting would take focus whenever that day next renders.
 */
export function seatedFocusTarget(
  surface: SurfaceState,
  reservationId: string
): FocusTarget | null {
  if (surface.openId !== null && surface.openId !== reservationId) return null;
  if (!focusIsLoose() && !focusIsInSurface()) return null;
  const onModal = surface.openId !== null && surface.modal;
  const testId = onModal ? RESERVATION_EDIT_TEST_ID : `reservation-block-${reservationId}`;
  return byTestId(testId) ? { kind: "testId", testId } : null;
}

/** Back to the trigger a status change disabled, unless the Host has taken focus elsewhere. */
export function tableStatusFocusTarget(tableId: string): FocusTarget | null {
  const testId = `table-status-${tableId}`;
  const trigger = byTestId(testId);
  return trigger && (focusIsLoose() || trigger === document.activeElement)
    ? { kind: "testId", testId }
    : null;
}

/**
 * Closes an overlay from a late response without pulling focus out of a dialog opened over it since.
 * A Rialto Drawer restores focus to its trigger a frame after it goes, behind that dialog. That frame
 * is scheduled in the commit's layout phase and this one after it, in the passive phase, so what held
 * focus gets it back. If what held focus was inside the overlay it is gone by then, the focus call
 * does nothing and the restore stands. `close` must change state, or no commit follows.
 */
export function useCloseHoldingFocus(): (close: () => void) => void {
  const heldRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const held = heldRef.current;
    if (!held) return;
    heldRef.current = null;
    requestAnimationFrame(() => held.focus());
  });
  return (close) => {
    const active = document.activeElement;
    heldRef.current =
      active instanceof HTMLElement && active.closest('[role="dialog"][aria-modal="true"]')
        ? active
        : null;
    close();
  };
}

/** Runs `onChange` in the render where `value` changes, before anything commits with the old state. */
export function useOnChange<T>(value: T, onChange: () => void): void {
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    onChange();
  }
}

interface DetailsSurfaceInput {
  readonly viewport: Viewport;
  readonly selectedId: string | null;
  readonly selectedReservation: Reservation | null;
  readonly dialogOpen: boolean;
  readonly dialogEpoch: number;
}

interface DetailsSurface {
  /** Which form the surface takes. */
  readonly surfaceViewport: Viewport;
  /** What the tablet sheet renders, including closed across a Seat now's selection gap. */
  readonly sheetReservation: Reservation | null;
  /** For use after an `await`: the surface when the response arrived, not when it was sent. */
  readonly surfaceRef: RefObject<SurfaceState>;
}

/** Decides what the details surface renders as, so nothing mounts under a dialog (#8029). */
export function useDetailsSurface({
  viewport,
  selectedId,
  selectedReservation,
  dialogOpen,
  dialogEpoch,
}: DetailsSurfaceInput): DetailsSurface {
  // It follows the viewport, except while a dialog is open: a sheet mounting under a dialog takes
  // focus and the Escape layer from it. A frame late, so a closing overlay's own focus restore has
  // run before a new surface takes focus.
  const [surfaceViewport, setSurfaceViewport] = useState(viewport);
  useEffect(() => {
    if (dialogOpen || surfaceViewport === viewport) return;
    const frame = requestAnimationFrame(() => setSurfaceViewport(viewport));
    return () => cancelAnimationFrame(frame);
  }, [dialogOpen, surfaceViewport, viewport]);

  // Seat now selects a reservation the refetch has yet to bring. The sheet stays mounted, closed,
  // across that gap: unmounting it would schedule a focus restore that could land on the old party's
  // block behind the new sheet, and only the same Drawer reopening can cancel it.
  const [heldReservation, setHeldReservation] = useState<Reservation | null>(null);
  const sheetReservation = selectedReservation ?? (selectedId ? heldReservation : null);
  if (sheetReservation !== heldReservation) setHeldReservation(sheetReservation);

  const surfaceRef = useRef<SurfaceState>({
    openId: null,
    modal: false,
    changingForm: false,
    dialogEpoch: 0,
  });
  useLayoutEffect(() => {
    const open = selectedReservation !== null;
    surfaceRef.current = {
      openId: selectedReservation?.id ?? null,
      modal: viewport !== "desktop" && open,
      changingForm: open && surfaceViewport !== viewport,
      dialogEpoch,
    };
  });

  return { surfaceViewport, sheetReservation, surfaceRef };
}
