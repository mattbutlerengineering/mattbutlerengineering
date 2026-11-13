import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useToast } from "@mattbutlerengineering/rialto";
import type { Venue } from "@mbe/types";
import {
  withBookingRules,
  type BookingRulesForm,
} from "../components/availability/booking-rules.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { focusOffToast, UNDO_TOAST_MS } from "./useAvailabilityUndo.js";
import { useUpdateVenue, VENUES_QUERY_KEY } from "./useVenues.js";

/** The venue as the venue list holds it right now; `null` when no cached list has it. */
function venueInCache(queryClient: QueryClient, venueId: string): Venue | null {
  const lists = queryClient.getQueriesData<readonly Venue[]>({ queryKey: [VENUES_QUERY_KEY] });
  for (const [, venues] of lists) {
    const venue = venues?.find((v) => v.id === venueId);
    if (venue) return venue;
  }
  return null;
}

export interface BookingRulesUndoOffer {
  readonly venueId: string;
  /** The three rules as they were before the save. */
  readonly previous: BookingRulesForm;
}

/**
 * The undo toast after a booking rules save (availability-hub architecture.md "Booking rules
 * Undo"). Venue settings have no version and no history, so Undo is a second save: the three
 * previous values written onto the settings the venue has at that moment, every other key kept.
 * If someone else changed the rules meanwhile, their three values are replaced.
 *
 * The offer reads the venue list's cache and outlives the component that made it, which closes
 * with the save.
 */
export function useBookingRulesUndo() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync } = useUpdateVenue();

  return useCallback(
    ({ venueId, previous }: BookingRulesUndoOffer) => {
      const offeredFrom = document.activeElement;
      const failed = (reason?: string) =>
        toast({
          title: t("availabilityHub.bookingRules.undoError"),
          ...(reason && { description: reason }),
          variant: "error",
          duration: UNDO_TOAST_MS,
          action: pressOnce(t("errorBanner.retry")),
        });
      const undo = async () => {
        const venue = venueInCache(queryClient, venueId);
        // Writing three values onto settings nobody can read would erase every other key.
        if (!venue) {
          failed();
          return;
        }
        try {
          await mutateAsync({
            venueId,
            data: { settings: withBookingRules(venue.settings, previous) },
          });
        } catch (error) {
          failed(describeApiError(error).detail);
          return;
        }
        toast({ title: t("availability.undo.done"), variant: "success", duration: 5000 });
      };
      // One press per button: a double click must not send the re-save twice.
      const pressOnce = (label: string) => {
        let pressed = false;
        return {
          label,
          onClick: () => {
            focusOffToast(offeredFrom);
            if (pressed) return;
            pressed = true;
            void undo();
          },
        };
      };
      toast({
        title: t("availability.bookingRules.saved"),
        variant: "success",
        duration: UNDO_TOAST_MS,
        action: pressOnce(t("availability.undo.action")),
      });
    },
    [mutateAsync, queryClient, t, toast]
  );
}
