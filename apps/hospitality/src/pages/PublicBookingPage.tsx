import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Stack, Text, Card } from "@mattbutlerengineering/rialto";
import { LoadingPage } from "./LoadingPage";

interface PublicVenueInfo {
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: Record<
    string,
    { open: string; close: string; closed?: boolean } | undefined
  > | null;
  settings: {
    defaultReservationDuration?: number;
    maxPartySize?: number;
    maxAdvanceBooking?: number;
    slotIntervalMinutes?: number;
  };
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function PublicBookingPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const [venue, setVenue] = useState<PublicVenueInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueSlug) return;

    const controller = new AbortController();

    fetch(`${API_BASE}/public/v1/venues/${venueSlug}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Venue not found" : "Failed to load venue");
        }
        return res.json();
      })
      .then((json) => {
        setVenue(json.data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [venueSlug]);

  if (loading) return <LoadingPage />;

  if (error || !venue) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          {error === "Venue not found" ? "Venue Not Found" : "Something went wrong"}
        </Text>
        <Text variant="body" color="secondary">
          {error === "Venue not found"
            ? "The venue you're looking for doesn't exist."
            : "Please try again later."}
        </Text>
      </Stack>
    );
  }

  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;

  return (
    <Stack align="center" style={{ minHeight: "100vh", padding: "2rem" }}>
      <Stack gap="lg" style={{ maxWidth: 600, width: "100%" }}>
        <Text as="h1" variant="display">
          {venue.name}
        </Text>

        <Card>
          <Stack gap="sm" style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="label">
              Hours
            </Text>
            {venue.operatingHours &&
              days.map((day) => {
                const schedule = venue.operatingHours?.[day];
                if (!schedule || schedule.closed) return null;
                return (
                  <Stack key={day} direction="row" justify="between">
                    <Text variant="body" style={{ textTransform: "capitalize" }}>
                      {day}
                    </Text>
                    <Text variant="body" color="secondary">
                      {schedule.open} – {schedule.close}
                    </Text>
                  </Stack>
                );
              })}
          </Stack>
        </Card>

        <Text variant="body" color="secondary">
          Booking coming soon — max party size {venue.settings.maxPartySize ?? 10}
        </Text>
      </Stack>
    </Stack>
  );
}
