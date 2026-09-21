import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { Button, Input, Select, Stack, Text } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type { CreateReservationRequest, Guest, Table } from "@mbe/types";
import { describeApiError } from "../../lib/describe-api-error.js";
import { useStatusMessage } from "../../hooks/useStatusMessage.js";
import { LiveStatus } from "../LiveStatus.js";
import { GuestLookup } from "../crm/GuestLookup.js";
import { GuestHistoryStrip } from "../crm/GuestHistoryStrip.js";
import { pickAnnouncement } from "../crm/guest-lookup-rows.js";
import { applyClear, applyPick, type PrefillSnapshot } from "../crm/guest-prefill.js";
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

// ux.md § Copy — the lookup field's hint, the linked strip's caption and the clear sentence.
const GUEST_NAME_HINT = "Name, email or phone — returning guests appear as you type.";
const LINK_ONLY_CAPTION =
  "Edits to email or phone below change this booking only — the profile isn't edited.";
const GUEST_CLEARED = "Guest cleared.";

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

// Formats a Date using its local components (not toISOString, which is UTC)
// so the result stays in the `YYYY-MM-DDTHH:mm:ss` shape the create payload expects.
function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function NewReservationDialog({
  tables,
  venueId,
  defaultDate,
  onConfirm,
  onClose,
}: NewReservationDialogProps) {
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState<string>(() => findBestTable(tables, 2));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<GuestLink | null>(null);
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

  const handlePick = (guest: Guest) => {
    setValue("guestName", guest.name);
    const { next, snapshot } = applyPick(
      { guestEmail: getValues("guestEmail"), guestPhone: getValues("guestPhone") },
      { email: guest.email, phone: guest.phone }
    );
    setValue("guestEmail", next.guestEmail);
    setValue("guestPhone", next.guestPhone);
    setLink({ guest, snapshot });
    announce(pickAnnouncement("linked", guest));
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
    announce(GUEST_CLEARED);
  };

  const availableTables = tables
    .filter((t) => t.isActive && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);

  const tableOptions = availableTables.map((t) => ({
    value: t.id,
    label: `${t.name} (seats ${t.capacity})`,
  }));

  const handlePartySizeChange = useCallback(
    (size: number) => {
      setPartySize(size);
      setTableId(findBestTable(tables, size));
    },
    [tables]
  );

  const onFormSubmit = async (data: NewReservationFormData) => {
    if (!tableId) {
      setError("Please select a table.");
      return;
    }

    const guestEmail = data.guestEmail.trim();
    const guestPhone = data.guestPhone.trim();
    if (!guestEmail && !guestPhone) {
      setError("Please provide a guest email or phone number.");
      return;
    }

    const startDate = new Date(`${data.date}T${data.startTime}:00`);
    const endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
    const startTime = formatLocalDateTime(startDate);
    const endTime = formatLocalDateTime(endDate);

    setIsLoading(true);
    setError(null);
    try {
      await onConfirm({
        date: data.date,
        startTime,
        endTime,
        partySize,
        tableId,
        venueId,
        guestName: data.guestName.trim(),
        guestEmail: guestEmail || undefined,
        guestPhone: guestPhone || undefined,
        // Only a picked guest links the booking; an ignored lookup leaves today's payload as is.
        ...(link ? { guestId: link.guest.id } : {}),
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
              <Text variant="display" id="new-reservation-dialog-title">
                New Reservation
              </Text>
            </div>

            {validationError && <div className={styles.errorBanner}>{validationError}</div>}

            <Stack gap="md">
              <GuestLookup
                venueId={venueId}
                label="Guest Name"
                hint={GUEST_NAME_HINT}
                placeholder="e.g. Smith"
                query={guestName}
                picked={link?.guest ?? null}
                onPick={handlePick}
                onClear={handleClear}
                announce={announce}
                disabled={isLoading}
                {...register("guestName", { required: "Guest name is required." })}
              />
              {link && (
                <GuestHistoryStrip
                  guest={link.guest}
                  mode="linked"
                  caption={LINK_ONLY_CAPTION}
                  onClear={handleClear}
                />
              )}

              <div className={styles.fieldRow}>
                <Input
                  label="Guest Email"
                  type="email"
                  placeholder="guest@example.com"
                  disabled={isLoading}
                  {...register("guestEmail")}
                />
                <Input
                  label="Guest Phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  disabled={isLoading}
                  {...register("guestPhone")}
                />
              </div>

              <div className={styles.fieldRow}>
                <Input
                  label="Date"
                  type="date"
                  disabled={isLoading}
                  {...register("date", { required: "Date is required." })}
                />
                <Input
                  label="Start Time"
                  type="time"
                  disabled={isLoading}
                  {...register("startTime", { required: "Start time is required." })}
                />
              </div>

              <div>
                <Text
                  variant="label"
                  color="secondary"
                  style={{ marginBottom: "var(--rialto-space-xs)" }}
                >
                  Party Size
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
                <Text color="secondary">No tables available for a party of {partySize}.</Text>
              ) : (
                <Select
                  label="Table"
                  value={tableId}
                  onChange={setTableId}
                  disabled={isLoading}
                  options={tableOptions}
                />
              )}
            </Stack>

            <div className={styles.actions}>
              <Button variant="secondary" type="button" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isLoading}
                disabled={availableTables.length === 0}
                loadingText="Creating…"
              >
                Create Reservation
              </Button>
            </div>
          </Stack>
        </form>
        <LiveStatus status={status} />
      </div>
    </div>
  );
}
