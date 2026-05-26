import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { createApiClient } from "@mbe/api-client";
import type { Venue } from "@mbe/types";
import { Stack, Text, Button, Card } from "@mattbutlerengineering/rialto";
import { BookingWidget } from "../components/booking-widget/index.js";
import styles from "./PublicBookingPage.module.css";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export function PublicBookingPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeHoldIdRef = useRef<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: BASE_URL,
        getAccessToken: () => null,
        maxRetries: 0,
      }),
    []
  );

  useEffect(() => {
    if (!venueSlug) {
      setError("No venue specified.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchVenue() {
      try {
        const result = await api.venues.getBySlug(venueSlug!);
        if (!cancelled) {
          setVenue(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Venue not found.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchVenue();
    return () => {
      cancelled = true;
    };
  }, [api, venueSlug]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const holdId = activeHoldIdRef.current;
      if (!holdId) return;
      navigator.sendBeacon(`${BASE_URL}/api/v1/holds/${holdId}`);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

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
              {error ?? "This booking page is no longer available."}
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
