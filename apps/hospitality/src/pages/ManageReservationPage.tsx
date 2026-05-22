import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Stack, Text, Card } from "@mattbutlerengineering/rialto";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface ReservationDetails {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  status: string;
  notes: string | null;
}

interface VenueDetails {
  id: string;
  name: string;
  slug: string;
  ianaTimezone: string;
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; type: "invalid" | "expired" }
  | { kind: "success"; reservation: ReservationDetails; venue: VenueDetails | null };

export function ManageReservationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<PageState>(
    token ? { kind: "loading" } : { kind: "error", type: "invalid" }
  );

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    fetch(`${API_BASE}/public/v1/reservations/manage?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          setState({ kind: "success", reservation: json.data.reservation, venue: json.data.venue });
        } else if (res.status === 410) {
          setState({ kind: "error", type: "expired" });
        } else {
          setState({ kind: "error", type: "invalid" });
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setState({ kind: "error", type: "invalid" });
        }
      });

    return () => controller.abort();
  }, [token]);

  if (state.kind === "loading") {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text variant="body" color="secondary">
          Loading reservation...
        </Text>
      </Stack>
    );
  }

  if (state.kind === "error") {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          {state.type === "expired" ? "Link Expired" : "Invalid Link"}
        </Text>
        <Text variant="body" color="secondary">
          {state.type === "expired"
            ? "This manage link has expired. Please contact the venue for assistance."
            : "This link is invalid or has already been used."}
        </Text>
      </Stack>
    );
  }

  const { reservation, venue } = state;

  return (
    <Stack align="center" style={{ minHeight: "100vh", padding: "2rem" }}>
      <Stack gap="lg" style={{ maxWidth: 600, width: "100%" }}>
        {venue && (
          <Text as="h1" variant="display">
            {venue.name}
          </Text>
        )}

        <Card>
          <Stack gap="md" style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="label">
              Reservation Details
            </Text>

            <Stack gap="sm">
              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Guest
                </Text>
                <Text variant="body">{reservation.guestName}</Text>
              </Stack>

              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Party Size
                </Text>
                <Text variant="body">{reservation.partySize} guests</Text>
              </Stack>

              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Date
                </Text>
                <Text variant="body">{reservation.date}</Text>
              </Stack>

              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Time
                </Text>
                <Text variant="body">
                  {reservation.startTime} – {reservation.endTime}
                </Text>
              </Stack>

              {reservation.notes && (
                <Stack direction="row" justify="between">
                  <Text variant="body" color="secondary">
                    Special Requests
                  </Text>
                  <Text variant="body">{reservation.notes}</Text>
                </Stack>
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Stack>
  );
}
