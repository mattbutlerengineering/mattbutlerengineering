import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TimeSlot } from "@mbe/types";
import type { ManagedReservation, ManagedReservationVenue } from "@mbe/api-client";
import { Alert, Button, Stack, Text } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import { DatePartySelector, TimeSlotPicker } from "../booking-widget/index.js";
import { useChangeBooking } from "../../hooks/useChangeBooking.js";
import { venueDate } from "../../utils/service-day.js";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import styles from "./ChangeBookingDialog.module.css";

interface ChangeBookingDialogProps {
  token: string;
  venue: ManagedReservationVenue;
  reservation: ManagedReservation;
  onChanged: (reservation: ManagedReservation) => void;
  onClose: () => void;
}

const KNOWN_ERRORS = [
  "SLOT_UNAVAILABLE",
  "HOLD_EXPIRED",
  "PARTY_SIZE_DEPOSIT_HELD",
  "MODIFICATION_CUTOFF",
  "PARTY_SIZE_CHANGE_TOO_LARGE",
] as const;
type KnownError = (typeof KNOWN_ERRORS)[number];

function isKnownError(code: string): code is KnownError {
  return (KNOWN_ERRORS as readonly string[]).includes(code);
}

/**
 * Guest change-booking flow: pick a new date/party/time (the same pickers as a fresh booking),
 * hold the slot, then confirm. The hold lifecycle lives in `useChangeBooking`.
 */
export function ChangeBookingDialog({
  token,
  venue,
  reservation,
  onChanged,
  onClose,
}: ChangeBookingDialogProps) {
  const { t } = useTranslation();
  const api = usePublicApiClient();
  const { status, error, selectSlot, confirm, abandon } = useChangeBooking({
    token,
    venueSlug: venue.slug,
  });
  const [date, setDate] = useState(reservation.date);
  const [partySize, setPartySize] = useState(reservation.partySize);
  const [step, setStep] = useState<"pick" | "slots">("pick");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TimeSlot | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const durationMs =
    new Date(reservation.endTime).getTime() - new Date(reservation.startTime).getTime();
  const maxPartySize =
    venue.maxPartySizeChange != null ? reservation.partySize + venue.maxPartySizeChange : undefined;

  const close = () => {
    void abandon();
    onClose();
  };

  useFocusTrap(panelRef, true);
  useEscapeKey(close, true);

  const findTimes = async () => {
    setSlotsLoading(true);
    setSlotsError(null);
    setSelected(null);
    setStep("slots");
    try {
      const response = await api.availability.getTimeSlotsForVenue(venue.slug, {
        date,
        partySize,
      });
      setSlots(response.filter((s) => s.available));
    } catch {
      setSlotsError(t("manageReservation.change.slotsFailed"));
    } finally {
      setSlotsLoading(false);
    }
  };

  const pick = (slot: TimeSlot) => {
    setSelected(slot);
    void selectSlot({
      date: venueDate(new Date(slot.time), venue.ianaTimezone),
      startTime: slot.time,
      endTime: new Date(new Date(slot.time).getTime() + durationMs).toISOString(),
      partySize,
    });
  };

  const handleConfirm = async () => {
    const ok = await confirm();
    if (ok) onChanged(ok);
  };

  const errorKey = error && isKnownError(error) ? error : "UNKNOWN";
  const busy = status === "holding" || status === "confirming";

  return (
    // Escape is handled via useEscapeKey; backdrop click mirrors the Cancel button.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-booking-title"
      >
        <Stack gap="lg">
          <Text variant="display" id="change-booking-title">
            {t("manageReservation.change.title")}
          </Text>

          {step === "pick" ? (
            <DatePartySelector
              selectedDate={date}
              partySize={partySize}
              onDateChange={setDate}
              onPartySizeChange={setPartySize}
              onNext={findTimes}
              maxPartySize={maxPartySize}
              venueTimezone={venue.ianaTimezone}
              phone={venue.phone}
            />
          ) : (
            <TimeSlotPicker
              slots={slots}
              selectedSlot={selected}
              isLoading={slotsLoading}
              error={slotsError}
              onSelectSlot={pick}
              onBack={() => {
                void abandon();
                setSelected(null);
                setStep("pick");
              }}
              date={date}
              partySize={partySize}
              venueTimezone={venue.ianaTimezone}
            />
          )}

          {status === "error" && (
            <Alert variant="error">{t(`manageReservation.change.errors.${errorKey}`)}</Alert>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={close} disabled={status === "confirming"}>
              {t("manageReservation.change.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={status !== "held" && status !== "confirming"}
              isLoading={busy && status === "confirming"}
              loadingText={t("manageReservation.change.confirming")}
            >
              {t("manageReservation.change.confirm")}
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
}
