import { useState, useEffect, useCallback, useMemo } from "react";
import { createApiClient } from "@mbe/api-client";
import type { TimeSlot, ReservationHold, Reservation } from "@mbe/types";
import { DatePartySelector } from "./DatePartySelector";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { GuestDetailsForm, type GuestDetails } from "./GuestDetailsForm";
import { ConfirmationView } from "./ConfirmationView";

type BookingStep = "date-party" | "time-slot" | "guest-details" | "confirmation";

export interface BookingWidgetProps {
  venueId: string;
  apiBaseUrl?: string;
  maxPartySize?: number;
  className?: string;
}

export function BookingWidget({
  venueId,
  apiBaseUrl = import.meta.env.VITE_API_URL ?? "",
  maxPartySize = 8,
  className = "",
}: BookingWidgetProps) {
  // Step management
  const [step, setStep] = useState<BookingStep>("date-party");

  // Date and party size
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);

  // Time slots
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Hold
  const [hold, setHold] = useState<ReservationHold | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);

  // Confirmation
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // API client - no auth token for public booking
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        getAccessToken: () => null,
      }),
    [apiBaseUrl]
  );

  // Fetch available time slots
  const fetchSlots = useCallback(async () => {
    if (!selectedDate) return;

    setSlotsLoading(true);
    setSlotsError(null);

    try {
      const response = await api.availability.getTimeSlots({
        venueId,
        date: selectedDate,
        partySize,
      });
      // Filter to only available slots
      setSlots(response.filter((slot) => slot.available));
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : "Failed to load availability");
    } finally {
      setSlotsLoading(false);
    }
  }, [api, venueId, selectedDate, partySize]);

  // Create a hold when selecting a time slot
  const createHold = useCallback(
    async (slot: TimeSlot) => {
      if (!selectedDate) return;

      setHoldLoading(true);
      setHoldError(null);

      try {
        const { hold: newHold } = await api.holds.create({
          venueId,
          date: selectedDate,
          time: slot.time,
          partySize,
        });
        setHold(newHold);
        setSelectedSlot(slot);
        setStep("guest-details");
      } catch (err) {
        setHoldError(err instanceof Error ? err.message : "Failed to hold time slot");
      } finally {
        setHoldLoading(false);
      }
    },
    [api, venueId, selectedDate, partySize]
  );

  // Confirm the reservation
  const confirmReservation = useCallback(
    async (details: GuestDetails) => {
      if (!hold) return;

      setConfirmLoading(true);
      setConfirmError(null);

      try {
        const confirmed = await api.holds.confirm(hold.id, {
          guestName: details.name,
          guestEmail: details.email || undefined,
          guestPhone: details.phone || undefined,
          notes: details.notes || undefined,
        });
        setReservation(confirmed);
        setStep("confirmation");
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : "Failed to confirm reservation");
      } finally {
        setConfirmLoading(false);
      }
    },
    [api, hold]
  );

  // Release hold when going back from guest details
  const releaseHold = useCallback(async () => {
    if (hold) {
      try {
        await api.holds.release(hold.id);
      } catch {
        // Ignore errors - hold will expire anyway
      }
      setHold(null);
    }
  }, [api, hold]);

  // Handle step navigation
  const goToDateParty = useCallback(() => {
    releaseHold();
    setStep("date-party");
    setSelectedSlot(null);
    setSlots([]);
  }, [releaseHold]);

  const goToTimeSlot = useCallback(() => {
    releaseHold();
    setStep("time-slot");
    setSelectedSlot(null);
    fetchSlots();
  }, [releaseHold, fetchSlots]);

  const handleFindTimes = useCallback(() => {
    setStep("time-slot");
    fetchSlots();
  }, [fetchSlots]);

  const handleSelectSlot = useCallback(
    (slot: TimeSlot) => {
      createHold(slot);
    },
    [createHold]
  );

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
  }, []);

  // Hold expiry timer
  useEffect(() => {
    if (!hold) return;

    const checkExpiry = () => {
      const expiresAt = new Date(hold.expiresAt);
      if (new Date() >= expiresAt) {
        setHoldError("Your hold has expired. Please select a new time.");
        setHold(null);
        setStep("time-slot");
        fetchSlots();
      }
    };

    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [hold, fetchSlots]);

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto ${className}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Make a Reservation</h2>
        {step !== "confirmation" && (
          <p className="text-sm text-gray-500 mt-1">
            {step === "date-party" && "Select your date and party size"}
            {step === "time-slot" && "Choose an available time"}
            {step === "guest-details" && "Enter your details to confirm"}
          </p>
        )}
      </div>

      {/* Step indicator */}
      {step !== "confirmation" && (
        <div className="flex items-center justify-center mb-6">
          {["date-party", "time-slot", "guest-details"].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? "bg-blue-600 text-white"
                    : ["date-party", "time-slot", "guest-details"].indexOf(step) > i
                    ? "bg-green-100 text-green-600"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {["date-party", "time-slot", "guest-details"].indexOf(step) > i ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && (
                <div
                  className={`w-12 h-0.5 ${
                    ["date-party", "time-slot", "guest-details"].indexOf(step) > i
                      ? "bg-green-200"
                      : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
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
          onSelectSlot={handleSelectSlot}
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
    </div>
  );
}
