import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { Table, WaitlistEntry } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import {
  useCancelWaitlistEntry,
  useCreateWaitlistEntry,
  useNotifyWaitlistEntry,
  useSeatWaitlistEntry,
  useWaitlist,
} from "../hooks/useWaitlist.js";
import { useTables } from "../hooks/useTables.js";
import { useApiClient } from "../hooks/useApiClient.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./WaitlistPage.module.css";

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/* ── Loading skeleton ────────────────────────────── */

function WaitlistLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Waitlist" description="Guests waiting for a table" />
      <SkeletonGroup>
        <Skeleton variant="card" width="100%" height={100} />
        <Skeleton variant="card" width="100%" height={100} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Wait time formatter ─────────────────────────── */

function formatWait(minutes: number): string {
  return `~${minutes} min`;
}

/**
 * Mirrors the server-side check in
 * services/reservations/src/services/waitlist-notifier.ts's `validatePhone` —
 * at least 7 digits, ignoring formatting characters — so a bad phone number
 * fails fast instead of round-tripping a 400.
 */
function isValidGuestPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7;
}

/* ── Add-to-waitlist form ────────────────────────────── */

interface WaitlistFormData {
  guestName: string;
  guestPhone: string;
}

function AddToWaitlistForm({ venueId }: { venueId: string }) {
  const { mutateAsync: createEntry, isPending } = useCreateWaitlistEntry();
  const [partySize, setPartySize] = useState(2);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WaitlistFormData>({
    defaultValues: { guestName: "", guestPhone: "" },
  });

  const onSubmit = async (data: WaitlistFormData) => {
    setSubmitError(null);
    try {
      await createEntry({
        venueId,
        partySize,
        guestName: data.guestName.trim(),
        guestPhone: data.guestPhone.trim(),
      });
      reset();
      setPartySize(2);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to add guest to waitlist.");
    }
  };

  const validationError = errors.guestName?.message ?? errors.guestPhone?.message ?? submitError;

  return (
    <Card>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <Text variant="label" color="secondary">
            Add to waitlist
          </Text>

          {validationError && <Alert variant="error">{validationError}</Alert>}

          <div className={styles.fieldRow}>
            <Input
              label="Guest Name"
              type="text"
              placeholder="e.g. Smith"
              disabled={isPending}
              {...register("guestName", { required: "Guest name is required." })}
            />
            <Input
              label="Guest Phone"
              type="tel"
              placeholder="(555) 123-4567"
              disabled={isPending}
              {...register("guestPhone", {
                required: "Guest phone is required.",
                validate: (value) => isValidGuestPhone(value) || "Enter a valid phone number.",
              })}
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
                  onClick={() => setPartySize(size)}
                  disabled={isPending}
                  aria-pressed={partySize === size}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            type="submit"
            isLoading={isPending}
            loadingText="Adding…"
            style={{ alignSelf: "flex-start" }}
          >
            Add to Waitlist
          </Button>
        </Stack>
      </form>
    </Card>
  );
}

/* ── Table selection for seating ─────────────────────── */

/** Available tables large enough for the party, smallest-fit first. */
function eligibleTables(tables: Table[], partySize: number): Table[] {
  return tables
    .filter((t) => t.status === "AVAILABLE" && t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity);
}

/* ── Waitlist row ─────────────────────────────────── */

function WaitlistRow({
  entry,
  tables,
  venueId,
}: {
  entry: WaitlistEntry;
  tables: Table[];
  venueId: string;
}) {
  const { mutateAsync: notify, isPending: isNotifying } = useNotifyWaitlistEntry();
  const { mutateAsync: cancelEntry, isPending: isCancelling } = useCancelWaitlistEntry();
  const { mutateAsync: markSeated } = useSeatWaitlistEntry();
  const api = useApiClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSeating, setIsSeating] = useState(false);

  const availableTables = eligibleTables(tables, entry.partySize);
  const availableTableIds = availableTables.map((t) => t.id).join(",");
  const [tableId, setTableId] = useState(() => availableTables[0]?.id ?? "");

  // useTables resolves asynchronously and independently of useWaitlist, so a
  // row typically mounts before table data arrives. Auto-select the first
  // eligible table once it shows up, but never clobber a table the staff
  // member already picked themselves. Render-time derivation (React's
  // "adjusting state when a prop changes" pattern) rather than a
  // useEffect+setState sync, which would cause an extra render pass.
  const [seenTableIds, setSeenTableIds] = useState(availableTableIds);
  if (availableTableIds !== seenTableIds) {
    setSeenTableIds(availableTableIds);
    if (!tableId || !availableTables.some((t) => t.id === tableId)) {
      setTableId(availableTables[0]?.id ?? "");
    }
  }

  const handleNotify = async () => {
    setActionError(null);
    try {
      await notify(entry.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to notify guest.");
    }
  };

  const handleCancel = async () => {
    setActionError(null);
    try {
      await cancelEntry(entry.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to cancel entry.");
    }
  };

  const handleSeat = async () => {
    if (!tableId) {
      setActionError("Please select a table.");
      return;
    }
    setActionError(null);
    setIsSeating(true);
    let reservationCreated = false;
    try {
      await api.reservations.walkIn({
        partySize: entry.partySize,
        tableId,
        venueId,
        guestName: entry.guestName,
      });
      reservationCreated = true;
      await markSeated(entry.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      setActionError(
        reservationCreated
          ? "Reservation created but the waitlist entry could not be marked seated — refresh and update it manually."
          : (message ?? "Failed to seat guest.")
      );
      setIsSeating(false);
    }
  };

  return (
    <Card>
      <div className={styles.row}>
        <Badge variant="neutral" size="sm">
          #{entry.position}
        </Badge>
        <div className={styles.details}>
          <Text variant="body" color="primary">
            {entry.guestName}
          </Text>
          <Text variant="caption" color="secondary">
            Party of {entry.partySize}
          </Text>
          {actionError && (
            <Text variant="caption" color="error">
              {actionError}
            </Text>
          )}
        </div>
        <Text variant="caption" color="secondary">
          {formatWait(entry.estimatedWaitMinutes)}
        </Text>
        {entry.notifiedAt && (
          <Badge variant="success" size="sm">
            Notified
          </Badge>
        )}
        <div className={styles.actions}>
          {availableTables.length > 0 ? (
            <Select
              label="Table"
              value={tableId}
              onChange={setTableId}
              disabled={isSeating}
              options={availableTables.map((t) => ({
                value: t.id,
                label: `${t.name} (seats ${t.capacity})`,
              }))}
            />
          ) : (
            <Text variant="caption" color="secondary">
              No tables available
            </Text>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSeat}
            isLoading={isSeating}
            loadingText="Seating…"
            disabled={availableTables.length === 0}
          >
            Seat
          </Button>
          {!entry.notifiedAt && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNotify}
              isLoading={isNotifying}
              loadingText="Notifying…"
            >
              Notify
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            isLoading={isCancelling}
            loadingText="Cancelling…"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ── Main component ─────────────────────────────────── */

export function WaitlistPage() {
  const { selectedVenueId } = useVenue();
  const {
    data: entries,
    isLoading,
    error: queryError,
  } = useWaitlist({ venueId: selectedVenueId ?? "" });
  const { data: tables } = useTables({ venueId: selectedVenueId ?? "" });

  const error = queryError?.message ?? null;
  const displayEntries = [...(entries ?? [])].sort((a, b) => a.position - b.position);

  if (isLoading && displayEntries.length === 0) {
    return <WaitlistLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title="Waitlist" description="Guests waiting for a table" />

      {error && (
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {selectedVenueId && (
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <AddToWaitlistForm venueId={selectedVenueId} />
        </div>
      )}

      {!isLoading && !error && displayEntries.length === 0 && (
        <div aria-live="polite" role="status">
          <EmptyState heading="No one waiting" description="The waitlist is currently empty." />
        </div>
      )}

      {!isLoading && !error && displayEntries.length > 0 && (
        <div className={styles.cards} aria-live="polite">
          {displayEntries.map((entry) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
              tables={tables ?? []}
              venueId={selectedVenueId ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}
