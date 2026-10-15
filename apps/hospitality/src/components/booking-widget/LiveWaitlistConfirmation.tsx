import { useQuery } from "@tanstack/react-query";
import type { WaitlistEstimate } from "@mbe/types";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import { WaitlistConfirmationView } from "./WaitlistConfirmationView.js";

/** How often the guest's own place in line is re-read from the server. */
export const WAITLIST_ESTIMATE_POLL_MS = 30_000;

export interface LiveWaitlistConfirmationProps {
  api: BookingWidgetApiClient;
  venueSlug: string;
  /** The join response: the entry id to poll, and the snapshot shown until the first poll lands. */
  joined: { statusToken: string; position: number; estimatedWaitMinutes: number };
  onNewBooking: () => void;
}

/**
 * The waitlist confirmation, kept live: the join-time numbers are only a
 * snapshot (position and wait move as parties ahead are seated or leave), so
 * this refetches the guest's own entry and renders the server value. TanStack
 * Query's `refetchInterval` pauses while the tab is hidden by default
 * (`refetchIntervalInBackground: false`); a failed poll keeps the last value.
 */
export function LiveWaitlistConfirmation({
  api,
  venueSlug,
  joined,
  onNewBooking,
}: LiveWaitlistConfirmationProps) {
  const { data } = useQuery<WaitlistEstimate>({
    queryKey: ["waitlist-estimate", venueSlug, joined.statusToken],
    queryFn: () => api.publicVenue.waitlistEstimate(venueSlug, joined.statusToken),
    initialData: {
      position: joined.position,
      estimatedWaitMinutes: joined.estimatedWaitMinutes,
      status: "waiting",
    },
    // Keep polling while in line or holding a table (notified becomes seated or
    // expired within minutes); stop on the terminal states.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "waiting" || status === "notified" ? WAITLIST_ESTIMATE_POLL_MS : false;
    },
    refetchIntervalInBackground: false,
    retry: false,
  });

  return (
    <WaitlistConfirmationView
      position={data.position}
      estimatedWaitMinutes={data.estimatedWaitMinutes}
      status={data.status}
      onNewBooking={onNewBooking}
    />
  );
}
