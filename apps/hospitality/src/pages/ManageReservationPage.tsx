import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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

interface ManageReservationData {
  reservation: ReservationDetails;
  venue: VenueDetails | null;
}

// Custom error type to distinguish expired vs invalid
class ManageTokenError extends Error {
  constructor(
    message: string,
    public readonly type: "invalid" | "expired"
  ) {
    super(message);
    this.name = "ManageTokenError";
  }
}

async function fetchManageReservation(token: string): Promise<ManageReservationData> {
  const res = await fetch(
    `${API_BASE}/public/v1/reservations/manage?token=${encodeURIComponent(token)}`
  );

  if (res.ok) {
    const json = await res.json();
    return { reservation: json.data.reservation, venue: json.data.venue };
  }

  if (res.status === 410) {
    throw new ManageTokenError("Link expired", "expired");
  }

  throw new ManageTokenError("Invalid link", "invalid");
}

export function ManageReservationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const { data, isLoading, error } = useQuery({
    queryKey: ["manageReservation", token],
    queryFn: () => fetchManageReservation(token!),
    enabled: !!token,
    retry: false,
  });

  // No token in URL
  if (!token) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          Invalid Link
        </Text>
        <Text variant="body" color="secondary">
          This link is invalid or has already been used.
        </Text>
      </Stack>
    );
  }

  if (isLoading) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text variant="body" color="secondary">
          Loading reservation...
        </Text>
      </Stack>
    );
  }

  if (error || !data) {
    const errorType =
      error instanceof ManageTokenError ? error.type : "invalid";

    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          {errorType === "expired" ? "Link Expired" : "Invalid Link"}
        </Text>
        <Text variant="body" color="secondary">
          {errorType === "expired"
            ? "This manage link has expired. Please contact the venue for assistance."
            : "This link is invalid or has already been used."}
        </Text>
      </Stack>
    );
  }

  const { reservation, venue } = data;

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
