import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Stack, Text, Card } from "@mattbutlerengineering/rialto";
import { toDateString } from "@mbe/types";
import type { TimeSlot } from "@mbe/types";
import { DatePartySelector } from "../components/booking-widget/DatePartySelector.js";
import { TimeSlotPicker } from "../components/booking-widget/TimeSlotPicker.js";
import { LoadingPage } from "./LoadingPage.js";

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

type BookingStep = "date-party" | "time-slot";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function PublicBookingPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();

  // Venue loading
  const [venue, setVenue] = useState<PublicVenueInfo | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [venueLoading, setVenueLoading] = useState(true);

  // Booking state
  const [step, setStep] = useState<BookingStep>("date-party");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);

  // Slot state
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Fetch venue info
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
        setVenueLoading(false);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setVenueError(err.message);
          setVenueLoading(false);
        }
      });

    return () => controller.abort();
  }, [venueSlug]);

  // Fetch availability slots
  const fetchSlots = useCallback(
    async (date: string, size: number) => {
      if (!venueSlug) return;

      setSlotsLoading(true);
      setSlotsError(null);
      setSlots([]);

      try {
        const params = new URLSearchParams({ date, partySize: String(size) });
        const res = await fetch(
          `${API_BASE}/public/v1/venues/${venueSlug}/availability?${params.toString()}`
        );

        if (!res.ok) {
          throw new Error("Failed to load available times");
        }

        const json = (await res.json()) as { data: TimeSlot[] };
        setSlots(json.data ?? []);
      } catch (err) {
        setSlotsError(err instanceof Error ? err.message : "Failed to load availability");
      } finally {
        setSlotsLoading(false);
      }
    },
    [venueSlug]
  );

  const handleFindTimes = useCallback(() => {
    if (!selectedDate) return;
    setStep("time-slot");
    void fetchSlots(selectedDate, partySize);
  }, [selectedDate, partySize, fetchSlots]);

  const handleBack = useCallback(() => {
    setStep("date-party");
    setSelectedSlot(null);
    setSlots([]);
    setSlotsError(null);
  }, []);

  const handleSelectSlot = useCallback((slot: TimeSlot) => {
    setSelectedSlot(slot);
    // TODO: wire to public holds → confirmation flow
  }, []);

  if (venueLoading) return <LoadingPage />;

  if (venueError || !venue) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          {venueError === "Venue not found" ? "Venue Not Found" : "Something went wrong"}
        </Text>
        <Text variant="body" color="secondary">
          {venueError === "Venue not found"
            ? "The venue you&apos;re looking for doesn&apos;t exist."
            : "Please try again later."}
        </Text>
      </Stack>
    );
  }

  const today = toDateString(new Date());
  const maxAdvanceDays = venue.settings.maxAdvanceBooking ?? 30;
  const maxBookingDate = new Date();
  maxBookingDate.setDate(maxBookingDate.getDate() + maxAdvanceDays);
  const maxDate = toDateString(maxBookingDate);
  const maxPartySize = venue.settings.maxPartySize ?? 10;

  return (
    <Stack align="center" style={{ minHeight: "100vh", padding: "2rem" }}>
      <Stack gap="lg" style={{ maxWidth: 600, width: "100%" }}>
        <Text as="h1" variant="display">
          {venue.name}
        </Text>

        <Card>
          <Stack gap="md" style={{ padding: "1.5rem" }}>
            {step === "date-party" && (
              <DatePartySelector
                selectedDate={selectedDate}
                partySize={partySize}
                onDateChange={setSelectedDate}
                onPartySizeChange={setPartySize}
                onNext={handleFindTimes}
                minDate={today}
                maxDate={maxDate}
                maxPartySize={maxPartySize}
              />
            )}

            {step === "time-slot" && selectedDate && (
              <TimeSlotPicker
                slots={slots}
                selectedSlot={selectedSlot}
                isLoading={slotsLoading}
                error={slotsError}
                onSelectSlot={handleSelectSlot}
                onBack={handleBack}
                date={selectedDate}
                partySize={partySize}
              />
            )}
          </Stack>
        </Card>
      </Stack>
    </Stack>
  );
}
