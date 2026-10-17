import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@mbe/api-client";
import { reportApiError } from "@mbe/sentry/react";
import type { ManagedReservation, ManagedReservationChanges } from "@mbe/api-client";
import { usePublicApiClient } from "./usePublicApiClient.js";

export interface ChangeBookingSlot {
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
}

export type ChangeBookingStatus = "idle" | "holding" | "held" | "confirming" | "done" | "error";

export interface UseChangeBookingOptions {
  token: string;
  venueSlug: string;
}

/** Server problem `code` (e.g. SLOT_UNAVAILABLE) so the UI can localize it. */
function problemCode(err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = err.problemDetails.code;
    if (typeof code === "string") return code;
  }
  return "UNKNOWN";
}

/**
 * Runs the guest change-booking sequence: hold the new slot, PATCH the
 * reservation with it, release the hold if the guest backs out. Keeps the
 * dialog presentational.
 */
export function useChangeBooking({ token, venueSlug }: UseChangeBookingOptions) {
  const api = usePublicApiClient();
  const [status, setStatus] = useState<ChangeBookingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const holdRef = useRef<{ holdId: string; slot: ChangeBookingSlot } | null>(null);

  const release = useCallback(async () => {
    const held = holdRef.current;
    if (!held) return;
    holdRef.current = null;
    // Best effort: an unreleasable hold simply expires server-side.
    await api.holds.releaseForVenue(venueSlug, held.holdId).catch(reportApiError);
  }, [api, venueSlug]);

  const selectSlot = useCallback(
    async (slot: ChangeBookingSlot) => {
      setError(null);
      setStatus("holding");
      await release();
      try {
        const { hold } = await api.holds.createForVenue(venueSlug, {
          date: slot.date,
          startTime: slot.startTime,
          partySize: slot.partySize,
        });
        holdRef.current = { holdId: hold.id, slot };
        setStatus("held");
      } catch (err) {
        setError(problemCode(err));
        setStatus("error");
      }
    },
    [api, venueSlug, release]
  );

  const confirm = useCallback(async (): Promise<ManagedReservation | undefined> => {
    const held = holdRef.current;
    if (!held) return undefined;
    setError(null);
    setStatus("confirming");
    const changes: ManagedReservationChanges = held.slot;
    try {
      const updated = await api.reservations.modifyManaged(token, changes, {
        holdId: held.holdId,
        sessionId: api.holds.getSessionId() ?? "",
      });
      // The server consumed the hold; nothing left to release.
      holdRef.current = null;
      setStatus("done");
      return updated;
    } catch (err) {
      setError(problemCode(err));
      setStatus("error");
      return undefined;
    }
  }, [api, token]);

  const abandon = useCallback(async () => {
    await release();
    setError(null);
    setStatus("idle");
  }, [release]);

  // Release on unmount (and under the old venue if the slug ever changes).
  useEffect(
    () => () => {
      void release();
    },
    [release]
  );

  return { status, error, selectSlot, confirm, abandon };
}
