import { useRef, useEffect } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Button, Text } from "@mattbutlerengineering/rialto";
import { BookingWidget, hasOperatingHours } from "../components/booking-widget/index.js";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import styles from "./PublicBookingPage.module.css";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const NOT_FOUND_HEADING = "Venue not found";
const NOT_FOUND_DESCRIPTION =
  "We couldn't find the booking page you're looking for. Double-check the link, or contact the venue directly to make your reservation.";

export function PublicBookingPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  // Guests resolve the venue through the unauthenticated by-slug read
  // (getBySlug -> /api/v1/venues/by-slug/:slug), the endpoint dedicated to
  // public booking URLs. It returns a curated PublicVenue projection —
  // including the id the booking widget needs for its venue-scoped calls —
  // which the deposit-only public config endpoint deliberately withholds
  // (#4022). The public client attaches no access token.
  const publicApiClient = usePublicApiClient({ baseUrl: BASE_URL, maxRetries: 0 });

  const activeHoldIdRef = useRef<string | null>(null);

  const {
    data: venue,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["publicVenueBySlug", venueSlug],
    queryFn: async () => {
      if (!venueSlug) throw new Error("No venue specified.");
      return publicApiClient.venues.getBySlug(venueSlug);
    },
    enabled: !!venueSlug,
    retry: false,
  });

  // beforeunload beacon to release holds
  useEffect(() => {
    const handleBeforeUnload = () => {
      const holdId = activeHoldIdRef.current;
      if (!holdId) return;
      navigator.sendBeacon(`${BASE_URL}/api/v1/holds/${holdId}`);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Branded, deliberately generic not-found. The raw transport error carries
  // the internal endpoint path (e.g. "GET /api/v1/venues/by-slug/... failed: 404")
  // and must never be surfaced to the guest.
  const renderNotFound = () => (
    <div className={styles.page}>
      <div className={styles.errorCenter}>
        <EmptyState
          variant="elevated"
          heading={NOT_FOUND_HEADING}
          description={NOT_FOUND_DESCRIPTION}
          action={
            <Button variant="primary" onClick={() => window.history.back()}>
              Go Back
            </Button>
          }
        />
      </div>
    </div>
  );

  if (!venueSlug) return renderNotFound();

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCenter}>
          <Text variant="body" color="secondary">
            Loading venue...
          </Text>
        </div>
      </div>
    );
  }

  if (error || !venue) return renderNotFound();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="display" as="h1" align="center" color="primary">
          {venue.name}
        </Text>
        <Text variant="body" color="secondary" align="center">
          Reserve your table online
        </Text>
      </div>

      <div className={styles.widgetWrapper}>
        <BookingWidget
          venueId={venue.id}
          venueSlug={venue.slug}
          apiBaseUrl={BASE_URL}
          hasOperatingHours={hasOperatingHours(venue.operatingHours)}
          onCancellation={() => {
            activeHoldIdRef.current = null;
          }}
        />
      </div>

      <footer className={styles.footer}>
        <Text variant="caption" color="tertiary" align="center">
          Powered by Matt Butler Engineering
        </Text>
      </footer>
    </div>
  );
}
