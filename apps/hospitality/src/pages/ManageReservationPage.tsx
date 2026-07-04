import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useUrlParams } from "../hooks/use-url-params.js";
import { Stack, Text, Card } from "@mattbutlerengineering/rialto";
import { ApiClientError, type ManageReservationData } from "@mbe/api-client";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

/* ── URL param schema ───────────────────────── */

const manageParamsSchema = z.object({
  token: z.string().default(""),
});

const MANAGE_DEFAULTS = manageParamsSchema.parse({});

export function ManageReservationPage() {
  const { params } = useUrlParams(manageParamsSchema, MANAGE_DEFAULTS);
  const token = params.token || null;
  const publicApiClient = usePublicApiClient({ baseUrl: API_BASE, maxRetries: 3 });

  const { data, isLoading, error } = useQuery({
    queryKey: ["manageReservation", token],
    queryFn: async (): Promise<ManageReservationData> => {
      try {
        return await publicApiClient.reservations.manageReservation(token!);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 410) {
          throw new ManageTokenError("Link expired", "expired");
        }
        throw new ManageTokenError("Invalid link", "invalid");
      }
    },
    enabled: !!token,
    retry: false,
  });

  // No token in URL
  if (!token) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          No Access Link
        </Text>
        <Text variant="body" color="secondary">
          Please check the link in your confirmation email.
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
    const errorType = error instanceof ManageTokenError ? error.type : "invalid";

    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          {errorType === "expired" ? "Link Expired" : "Invalid Link"}
        </Text>
        <Text variant="body" color="secondary">
          {errorType === "expired"
            ? "This manage link has expired. Please contact the venue for assistance."
            : "This link has already been used or is invalid."}
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
