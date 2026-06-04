import { useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@mbe/api-client";
import { Stack, Text, Button, Card } from "@mattbutlerengineering/rialto";
import { BookingWidget } from "../components/booking-widget/index.js";
import styles from "./PublicBookingPage.module.css";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// Public API client — no auth token required for public endpoints
const publicApiClient = createApiClient({
  baseUrl: BASE_URL,
  getAccessToken: () => null,
  maxRetries: 0,
});

export function PublicBookingPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();

  const activeHoldIdRef = useRef<string | null>(null);

  const { data: venue, isLoading, error } = useQuery({
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

  if (!venueSlug) {
    return (
      <div className={styles.page}>
        <Card variant="flat" className={styles.errorCard}>
          <Stack gap="md" align="center">
            <Text variant="display" as="h1" color="primary">
              Venue Not Found
            </Text>
            <Text variant="body" color="secondary">
              No venue specified.
            </Text>
            <Button variant="primary" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

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

  if (error || !venue) {
    return (
      <div className={styles.page}>
        <Card variant="flat" className={styles.errorCard}>
          <Stack gap="md" align="center">
            <Text variant="display" as="h1" color="primary">
              Venue Not Found
            </Text>
            <Text variant="body" color="secondary">
              {error instanceof Error ? error.message : "This booking page is no longer available."}
            </Text>
            <Button variant="primary" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

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
