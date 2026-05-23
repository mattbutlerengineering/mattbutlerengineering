import { useQueryClient } from "@tanstack/react-query";
import { useReservationEvents } from "./useReservationEvents.js";
import { useVenue } from "../contexts/VenueContext.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { TABLES_QUERY_KEY } from "./useTables.js";

export function useReservationQuerySync() {
  const queryClient = useQueryClient();
  const { selectedVenueId } = useVenue();

  const invalidateReservations = () => {
    queryClient.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
  };

  const invalidateTables = () => {
    queryClient.invalidateQueries({ queryKey: [TABLES_QUERY_KEY] });
  };

  return useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    onReservationCreated: invalidateReservations,
    onReservationUpdated: invalidateReservations,
    onReservationCancelled: invalidateReservations,
    onHoldConfirmed: invalidateReservations,
    onTableUpdated: invalidateTables,
  });
}
