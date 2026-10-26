import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button, Input, Select, Stack, Text, Heading } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type {
  CreateReservationRequest,
  Guest,
  Occasion,
  SeatingPreference,
  Table,
} from "@mbe/types";
import { describeApiError } from "../../lib/describe-api-error.js";
import { useStatusMessage } from "../../hooks/useStatusMessage.js";
import { LiveStatus } from "../LiveStatus.js";
import { GuestLookup } from "../crm/GuestLookup.js";
import { GuestHistoryStrip } from "../crm/GuestHistoryStrip.js";
import { pickAnnouncement } from "../crm/guest-lookup-rows.js";
import { applyClear, applyPick, type PrefillSnapshot } from "../crm/guest-prefill.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { venueWallTimeToInstant } from "../../utils/venue-wall-time.js";
import { useStaffBookingCheck } from "../../hooks/useStaffBookingCheck.js";
import { useOpenTimes } from "../../hooks/useOpenTimes.js";
import { OccasionSeatingFields } from "./OccasionSeatingFields.js";
import { OpenTimesStrip } from "./OpenTimesStrip.js";
import { StaffCheckNotice } from "./StaffCheckNotice.js";
import styles from "./NewReservationDialog.module.css";

interface NewReservationDialogProps {
  tables: Table[];
  venueId: string;
  defaultDate: string;
  onConfirm: (data: CreateReservationRequest) => Promise<void>;
  onClose: () => void;
}

interface NewReservationFormData {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  date: string;
  startTime: string;
}

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The picked guest plus what the contact fields held before prefill, so Clear can restore them. */
interface GuestLink {
  guest: Guest;
  snapshot: PrefillSnapshot;
}

// No duration control in this minimal form — 90 minutes matches the
// walk-in route's server-side default (see reservationRoutes "/walk-in").
const DEFAULT_DURATION_MINUTES = 90;

function findBestTable(tables: Table[], partySize: number): string {
  const eligible = tables
    .filter((t) => t.isActive && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);
  return eligible[0]?.id ?? "";
}

export function NewReservationDialog({
  tables,
  venueId,
  defaultDate,
  onConfirm,
  onClose,
}: NewReservationDialogProps) {
  const { t } = useTranslation();
  const { timeZone } = useVenueFormat();
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState<string>(() => findBestTable(tables, 2));
  const [occasion, setOccasion] = useState<Occasion>("none");
  const [seatingPreference, setSeatingPreference] = useState<SeatingPreference>("no_preference");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<GuestLink | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const { status, announce } = useStatusMessage();

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const handleClose = useCallback(() => {
    previouslyFocusedRef.current?.focus();
    onClose();
  }, [onClose]);

  useFocusTrap(panelRef, true);
  useEscapeKey(handleClose, true);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<NewReservationFormData>({
    defaultValues: {
      guestName: "",
      guestEmail: "",
      guestPhone: "",
      date: defaultDate,
      startTime: "",
    },
  });

  const guestName = watch("guestName");
  const date = watch("date");
  const startTime = watch("startTime");

  // The booking's real window, read on the venue clock; null until date and time are both entered.
  const bookingWindow = useMemo(() => {
    if (!date || !startTime) return null;
    const start = venueWallTimeToInstant(date, startTime, timeZone);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [date, startTime, timeZone]);

  const handlePick = (guest: Guest) => {
    setValue("guestName", guest.name);
    const { next, snapshot } = applyPick(
      { guestEmail: getValues("guestEmail"), guestPhone: getValues("guestPhone") },
      { email: guest.email, phone: guest.phone }
    );
    setValue("guestEmail", next.guestEmail);
    setValue("guestPhone", next.guestPhone);
    setLink({ guest, snapshot });
    announce(pickAnnouncement("linked", guest, t));
  };

  const handleClear = () => {
    if (!link) return;
    const restored = applyClear(
      { guestEmail: getValues("guestEmail"), guestPhone: getValues("guestPhone") },
      link.snapshot
    );
    setValue("guestEmail", restored.guestEmail);
    setValue("guestPhone", restored.guestPhone);
    setLink(null);
    setFocus("guestName", { shouldSelect: true });
    announce(t("newReservation.guestCleared"));
  };

  const availableTables = tables
    .filter((table) => table.isActive && table.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);

  const check = useStaffBookingCheck({
    venueId,
    window: bookingWindow,
    partySize,
    tableIds: availableTables.map((table) => table.id),
    selectedTableId: tableId,
  });
  const openTimes = useOpenTimes({ venueId, date, partySize });
  const isHardBlocked = check.verdict?.kind === "hard";
  const needsOverride = check.verdict?.kind === "soft";
  const trimmedReason = overrideReason.trim();

  const tableOptions = availableTables.map((table) => {
    const label = t("newReservation.tableOption", { name: table.name, capacity: table.capacity });
    const blocked = check.blockedTableIds.has(table.id);
    return {
      value: table.id,
      label: blocked ? t("newReservation.check.tableBlocked", { label }) : label,
      disabled: blocked,
    };
  });

  const handlePartySizeChange = useCallback(
    (size: number) => {
      setPartySize(size);
      setTableId(findBestTable(tables, size));
    },
    [tables]
  );

  const onFormSubmit = async (data: NewReservationFormData) => {
    if (!tableId) {
      setError(t("newReservation.selectTable"));
      return;
    }

    const guestEmail = data.guestEmail.trim();
    const guestPhone = data.guestPhone.trim();
    if (!guestEmail && !guestPhone) {
      setError(t("newReservation.needContact"));
      return;
    }

    if (isHardBlocked) return;
    if (needsOverride && !trimmedReason) {
      setError(t("newReservation.check.reasonLabel"));
      return;
    }

    // The picked date and time are the venue's wall clock; the API takes the UTC instant.
    const startDate = venueWallTimeToInstant(data.date, data.startTime, timeZone);
    const endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

    setIsLoading(true);
    setError(null);
    try {
      await onConfirm({
        date: data.date,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        partySize,
        tableId,
        venueId,
        guestName: data.guestName.trim(),
        guestEmail: guestEmail || undefined,
        guestPhone: guestPhone || undefined,
        // Only a picked guest links the booking; an ignored lookup leaves today's payload as is.
        ...(link ? { guestId: link.guest.id } : {}),
        ...(occasion !== "none" ? { occasion } : {}),
        ...(seatingPreference !== "no_preference" ? { seatingPreference } : {}),
        ...(needsOverride ? { override: { reason: trimmedReason } } : {}),
      });
    } catch (err) {
      setError(describeApiError(err).detail);
      setIsLoading(false);
    }
  };

  const validationError =
    errors.guestName?.message ?? errors.date?.message ?? errors.startTime?.message ?? error;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    // Escape is handled globally via useEscapeKey; this backdrop click is a
    // pointer-only affordance equivalent to the Cancel button already in the dialog.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-reservation-dialog-title"
      >
        <form noValidate onSubmit={handleSubmit(onFormSubmit)}>
          <Stack gap="lg">
            <div className={styles.header}>
              <Heading id="new-reservation-dialog-title">{t("newReservation.title")}</Heading>
            </div>

            {validationError && (
              <div role="alert" aria-live="assertive" className={styles.errorBanner}>
                {validationError}
              </div>
            )}

            <Stack gap="md">
              <GuestLookup
                venueId={venueId}
                label={t("newReservation.guestName")}
                hint={t("newReservation.nameHint")}
                placeholder={t("newReservation.namePlaceholder")}
                query={guestName}
                picked={link?.guest ?? null}
                onPick={handlePick}
                onClear={handleClear}
                announce={announce}
                disabled={isLoading}
                {...register("guestName", { required: t("newReservation.nameRequired") })}
              />
              {link && (
                <GuestHistoryStrip
                  guest={link.guest}
                  mode="linked"
                  caption={t("newReservation.linkOnlyCaption")}
                  onClear={handleClear}
                />
              )}

              <div className={styles.fieldRow}>
                <Input
                  label={t("newReservation.email")}
                  type="email"
                  placeholder={t("newReservation.emailPlaceholder")}
                  disabled={isLoading}
                  {...register("guestEmail")}
                />
                <Input
                  label={t("newReservation.phone")}
                  type="tel"
                  placeholder="(555) 123-4567"
                  disabled={isLoading}
                  {...register("guestPhone")}
                />
              </div>

              <div className={styles.fieldRow}>
                <Input
                  label={t("newReservation.date")}
                  type="date"
                  disabled={isLoading}
                  {...register("date", { required: t("newReservation.dateRequired") })}
                />
                <Input
                  label={t("newReservation.startTime")}
                  type="time"
                  disabled={isLoading}
                  {...register("startTime", { required: t("newReservation.startTimeRequired") })}
                />
              </div>

              <OpenTimesStrip
                slots={openTimes.data ?? []}
                partySize={partySize}
                selectedTime={startTime}
                onPick={(hhmm) => setValue("startTime", hhmm, { shouldValidate: true })}
                disabled={isLoading}
              />
              <StaffCheckNotice
                check={check}
                reason={overrideReason}
                onReasonChange={setOverrideReason}
                disabled={isLoading}
              />

              <div>
                <Text
                  variant="label"
                  color="secondary"
                  style={{ marginBottom: "var(--rialto-space-xs)" }}
                >
                  {t("newReservation.partySize")}
                </Text>
                <div className={styles.partySizeRow}>
                  {PARTY_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      variant={partySize === size ? "primary" : "secondary"}
                      size="sm"
                      type="button"
                      onClick={() => handlePartySizeChange(size)}
                      disabled={isLoading}
                      aria-pressed={partySize === size}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>

              {availableTables.length === 0 ? (
                <Text color="secondary">{t("newReservation.noTables", { size: partySize })}</Text>
              ) : (
                <Select
                  label={t("newReservation.table")}
                  value={tableId}
                  onChange={setTableId}
                  disabled={isLoading}
                  options={tableOptions}
                />
              )}

              <OccasionSeatingFields
                occasion={occasion}
                seatingPreference={seatingPreference}
                onOccasionChange={setOccasion}
                onSeatingPreferenceChange={setSeatingPreference}
                disabled={isLoading}
              />
            </Stack>

            <div className={styles.actions}>
              <Button variant="secondary" type="button" onClick={handleClose} disabled={isLoading}>
                {t("newReservation.cancel")}
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isLoading}
                disabled={
                  availableTables.length === 0 || isHardBlocked || (needsOverride && !trimmedReason)
                }
                loadingText={t("newReservation.creating")}
              >
                {needsOverride
                  ? t("newReservation.check.bookWithOverride")
                  : t("newReservation.create")}
              </Button>
            </div>
          </Stack>
        </form>
        <LiveStatus status={status} />
      </div>
    </div>
  );
}
