import { useEffect, useRef, useState, useCallback, useReducer } from "react";
import { useParams } from "react-router-dom";
import { Stack, Text, Card, Steps } from "@mattbutlerengineering/rialto";
import type { StepItem } from "@mattbutlerengineering/rialto";
import type { TimeSlot, ReservationHold, Reservation } from "@mbe/types";
import { LoadingPage } from "./LoadingPage";
import { DatePartySelector } from "../components/booking-widget/DatePartySelector";
import { TimeSlotPicker } from "../components/booking-widget/TimeSlotPicker";
import { GuestDetailsForm, type GuestDetails } from "../components/booking-widget/GuestDetailsForm";
import { ConfirmationView } from "../components/booking-widget/ConfirmationView";

interface PublicVenueInfo {
  id: string;
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
    holdDurationMinutes?: number;
  };
}

const API_BASE = import.meta.env.VITE_API_URL || "";

type BookingStep = "date-party" | "time-slot" | "guest-details" | "confirmation";

const STEP_KEYS: BookingStep[] = ["date-party", "time-slot", "guest-details"];

const BOOKING_STEPS: StepItem[] = [
  { label: "Date & Party" },
  { label: "Time" },
  { label: "Details" },
];

export function PublicBookingPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const [venue, setVenue] = useState<PublicVenueInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Booking flow state
  const [step, setStep] = useState<BookingStep>("date-party");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [hold, setHold] = useState<ReservationHold | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Track hold id for beacon on unload
  const holdIdRef = useRef<string | null>(null);

  // Load venue info
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

  // Release hold on page unload using sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      const id = holdIdRef.current;
      if (!id || !venueSlug) return;
      const url = `${API_BASE}/public/v1/venues/${venueSlug}/holds/${id}`;
      // sendBeacon survives page unload; falls back to sync XHR if unavailable
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([], { type: "application/json" }));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [venueSlug]);

  // Fetch available time slots
  const fetchSlots = useCallback(async () => {
    if (!selectedDate || !venueSlug) return;

    setSlotsLoading(true);
    setSlotsError(null);

    try {
      const url = `${API_BASE}/public/v1/venues/${venueSlug}/availability?date=${selectedDate}&partySize=${partySize}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load availability");
      const json = await res.json();
      setSlots((json.data as TimeSlot[]).filter((s) => s.available));
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : "Failed to load availability");
    } finally {
      setSlotsLoading(false);
    }
  }, [venueSlug, selectedDate, partySize]);

  // Create a hold when selecting a time slot
  const createHold = useCallback(
    async (slot: TimeSlot) => {
      if (!selectedDate || !venueSlug) return;

      setHoldLoading(true);
      setHoldError(null);

      try {
        const res = await fetch(`${API_BASE}/public/v1/venues/${venueSlug}/holds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate, time: slot.time, partySize }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { detail?: string }).detail ?? "Failed to hold time slot");
        }

        const json = await res.json();
        const newHold: ReservationHold = json.data;
        holdIdRef.current = newHold.id;
        setHold(newHold);
        setSelectedSlot(slot);
        setStep("guest-details");
      } catch (err) {
        setHoldError(err instanceof Error ? err.message : "Failed to hold time slot");
      } finally {
        setHoldLoading(false);
      }
    },
    [venueSlug, selectedDate, partySize]
  );

  // Release hold explicitly (back navigation)
  const releaseHold = useCallback(async () => {
    const id = holdIdRef.current;
    if (!id || !venueSlug) return;
    holdIdRef.current = null;
    setHold(null);
    try {
      await fetch(`${API_BASE}/public/v1/venues/${venueSlug}/holds/${id}`, {
        method: "DELETE",
      });
    } catch {
      // Hold will expire; ignore errors
    }
  }, [venueSlug]);

  // Hold expiry timer — return to slot picker with message
  const [, forceRender] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    if (!hold) return;
    const interval = setInterval(() => {
      const expiresAt = new Date(hold.expiresAt);
      if (new Date() >= expiresAt) {
        holdIdRef.current = null;
        setHold(null);
        setHoldError("Your hold has expired. Please select a new time.");
        setStep("time-slot");
        fetchSlots();
      } else {
        forceRender();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [hold, fetchSlots]);

  // Confirm reservation
  const confirmReservation = useCallback(
    async (details: GuestDetails) => {
      if (!hold || !venueSlug) return;

      setConfirmLoading(true);
      setConfirmError(null);

      try {
        const res = await fetch(`${API_BASE}/public/v1/venues/${venueSlug}/reservations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdId: hold.id,
            guestName: details.name,
            guestEmail: details.email || undefined,
            guestPhone: details.phone || undefined,
            specialRequests: details.notes || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { detail?: string }).detail ?? "Failed to confirm reservation"
          );
        }

        const json = await res.json();
        holdIdRef.current = null;
        setHold(null);
        setReservation(json.data.reservation as Reservation);
        setStep("confirmation");
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : "Failed to confirm reservation");
      } finally {
        setConfirmLoading(false);
      }
    },
    [hold, venueSlug]
  );

  // Navigation handlers
  const goToDateParty = useCallback(() => {
    releaseHold();
    setStep("date-party");
    setSelectedSlot(null);
    setSlots([]);
    setSlotsError(null);
    setHoldError(null);
  }, [releaseHold]);

  const goToTimeSlot = useCallback(() => {
    releaseHold();
    setStep("time-slot");
    setSelectedSlot(null);
    setHoldError(null);
    fetchSlots();
  }, [releaseHold, fetchSlots]);

  const handleFindTimes = useCallback(() => {
    setStep("time-slot");
    fetchSlots();
  }, [fetchSlots]);

  const handleNewBooking = useCallback(() => {
    setStep("date-party");
    setSelectedDate(null);
    setPartySize(2);
    setSlots([]);
    setSelectedSlot(null);
    setHold(null);
    setReservation(null);
    setSlotsError(null);
    setHoldError(null);
    setConfirmError(null);
    holdIdRef.current = null;
  }, []);

  if (loading) return <LoadingPage />;

  if (error || !venue) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text as="h1" variant="display">
          {error === "Venue not found" ? "Venue Not Found" : "Something went wrong"}
        </Text>
        <Text variant="body" color="secondary">
          {error === "Venue not found"
            ? "The venue you&apos;re looking for doesn&apos;t exist."
            : "Please try again later."}
        </Text>
      </Stack>
    );
  }

  const currentStepIndex = STEP_KEYS.indexOf(step as (typeof STEP_KEYS)[number]);
  const maxPartySize = venue.settings.maxPartySize ?? 10;

  return (
    <Stack align="center" style={{ minHeight: "100vh", padding: "2rem" }}>
      <Stack gap="lg" style={{ maxWidth: 480, width: "100%" }}>
        <Text as="h1" variant="display" align="center">
          {venue.name}
        </Text>

        <Card>
          <Stack gap="lg" style={{ padding: "1.5rem" }}>
            {/* Header */}
            <Stack gap="xs">
              <Text variant="display" as="h2" align="center">
                Make a Reservation
              </Text>
              {step !== "confirmation" && (
                <Text variant="caption" color="secondary" align="center">
                  {step === "date-party" && "Select your date and party size"}
                  {step === "time-slot" && "Choose an available time"}
                  {step === "guest-details" && "Enter your details to confirm"}
                </Text>
              )}
            </Stack>

            {/* Step indicator */}
            {step !== "confirmation" && (
              <Steps steps={BOOKING_STEPS} currentStep={currentStepIndex} compact />
            )}

            {/* Step content */}
            {step === "date-party" && (
              <DatePartySelector
                selectedDate={selectedDate}
                partySize={partySize}
                onDateChange={setSelectedDate}
                onPartySizeChange={setPartySize}
                onNext={handleFindTimes}
                maxPartySize={maxPartySize}
              />
            )}

            {step === "time-slot" && selectedDate && (
              <TimeSlotPicker
                slots={slots}
                selectedSlot={selectedSlot}
                isLoading={slotsLoading || holdLoading}
                error={slotsError || holdError}
                onSelectSlot={createHold}
                onBack={goToDateParty}
                date={selectedDate}
                partySize={partySize}
              />
            )}

            {step === "guest-details" && selectedSlot && selectedDate && (
              <GuestDetailsForm
                slot={selectedSlot}
                hold={hold}
                date={selectedDate}
                partySize={partySize}
                isLoading={confirmLoading}
                error={confirmError}
                onSubmit={confirmReservation}
                onBack={goToTimeSlot}
              />
            )}

            {step === "confirmation" && reservation && (
              <ConfirmationView
                reservation={reservation}
                onNewBooking={handleNewBooking}
              />
            )}
          </Stack>
        </Card>
      </Stack>
    </Stack>
  );
}
