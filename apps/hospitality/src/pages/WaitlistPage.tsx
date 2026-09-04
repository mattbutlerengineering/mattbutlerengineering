import { useState } from "react";
import { useNavigate } from "react-router";
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
  useToast,
} from "@mattbutlerengineering/rialto";
import type { Reservation, Table, WaitlistEntry } from "@mbe/types";
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
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { LiveStatus } from "../components/LiveStatus.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { localDateString } from "../utils/local-clock.js";
import styles from "./WaitlistPage.module.css";

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/** What a failed action shows: the surface title (what did not happen), the sentence, the raw line behind "Show details". */
interface ActionFailure {
  title?: string;
  detail: string;
  raw?: string;
}

function actionFailure(title: string, err: unknown): ActionFailure {
  const description = describeApiError(err);
  return { title, detail: description.detail, raw: description.raw };
}

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

function AddToWaitlistForm({
  venueId,
  onAdded,
}: {
  venueId: string;
  onAdded: (entry: WaitlistEntry) => void;
}) {
  const { mutateAsync: createEntry, isPending } = useCreateWaitlistEntry();
  const [partySize, setPartySize] = useState(2);
  const [submitFailure, setSubmitFailure] = useState<ActionFailure | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WaitlistFormData>({
    defaultValues: { guestName: "", guestPhone: "" },
  });

  const onSubmit = async (data: WaitlistFormData) => {
    setSubmitFailure(null);
    try {
      const entry = await createEntry({
        venueId,
        partySize,
        guestName: data.guestName.trim(),
        guestPhone: data.guestPhone.trim(),
      });
      reset();
      setPartySize(2);
      onAdded(entry);
    } catch (err) {
      setSubmitFailure(actionFailure("Not added.", err));
    }
  };

  const validationMessage = errors.guestName?.message ?? errors.guestPhone?.message;

  return (
    <Card>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <Text variant="label" color="secondary">
            Add to waitlist
          </Text>

          {validationMessage && <Alert variant="error">{validationMessage}</Alert>}
          {submitFailure && (
            <ErrorRetryBanner
              title={submitFailure.title}
              error={submitFailure.detail}
              details={submitFailure.raw}
            />
          )}

          <div className={styles.fieldRow}>
            <Input
              label="Guest Name"
              type="text"
              placeholder="e.g. Smith"
              disabled={isPending}
              data-testid="waitlist-guest-name"
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
  onNotified,
  onCancelled,
  onSeated,
}: {
  entry: WaitlistEntry;
  tables: Table[];
  venueId: string;
  onNotified: (entry: WaitlistEntry) => void;
  onCancelled: (entry: WaitlistEntry) => void;
  onSeated: (entry: WaitlistEntry, reservation: Reservation, tableName: string) => void;
}) {
  const { mutateAsync: notify, isPending: isNotifying } = useNotifyWaitlistEntry();
  const { mutateAsync: cancelEntry, isPending: isCancelling } = useCancelWaitlistEntry();
  const { mutateAsync: markSeated } = useSeatWaitlistEntry();
  const api = useApiClient();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
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
    setFailure(null);
    try {
      await notify(entry.id);
      onNotified(entry);
    } catch (err) {
      setFailure(actionFailure("Not notified.", err));
    }
  };

  const handleCancel = async () => {
    setFailure(null);
    try {
      await cancelEntry(entry.id);
      onCancelled(entry);
    } catch (err) {
      setFailure(actionFailure("Not removed.", err));
    }
  };

  const handleSeat = async () => {
    if (!tableId) {
      setFailure({ detail: "Please select a table." });
      return;
    }
    setFailure(null);
    setIsSeating(true);
    const tableName = availableTables.find((t) => t.id === tableId)?.name ?? "the table";
    let reservation: Reservation | null = null;
    try {
      reservation = await api.reservations.walkIn({
        partySize: entry.partySize,
        tableId,
        venueId,
        guestName: entry.guestName,
      });
      await markSeated(entry.id);
      onSeated(entry, reservation, tableName);
    } catch (err) {
      // The split failure: the guest IS seated (reservation created); only the waitlist row is stale.
      setFailure(
        reservation
          ? {
              detail: `Seated at ${tableName}, but the waitlist didn't update. Refresh to tidy up.`,
              raw: describeApiError(err).raw,
            }
          : actionFailure("Not seated.", err)
      );
      setIsSeating(false);
    }
  };

  return (
    // tabIndex={-1}: the card is a useFocusAfter target (rule (d) — the row that changed, or the next one).
    <Card tabIndex={-1} data-testid={`waitlist-entry-${entry.id}`}>
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
          {failure && (
            <ErrorRetryBanner title={failure.title} error={failure.detail} details={failure.raw} />
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { status, announce } = useStatusMessage();
  const { focusAfter } = useFocusAfter();
  const {
    data: entries,
    isLoading,
    error: queryError,
    refetch,
  } = useWaitlist({ venueId: selectedVenueId ?? "" });
  // `enabled` is load-bearing here, not belt-and-braces: GET /api/v1/tables is
  // venue-scoped (#4873), so `requireVenueAccess` resolves the venue to check
  // membership against from `?venueId`. Firing with the empty placeholder
  // before the venue list resolves is a guaranteed 403 for any non-admin
  // operator, not an empty result.
  const { data: tables } = useTables({
    venueId: selectedVenueId ?? undefined,
    enabled: !!selectedVenueId,
  });

  const loadFailure = queryError ? describeApiError(queryError) : null;
  const displayEntries = [...(entries ?? [])].sort((a, b) => a.position - b.position);

  /**
   * ux.md rule (d) once a row has left the list: the next entry's card; when it was the last one
   * waiting, the "No one waiting" block (focused once it renders); otherwise the page heading.
   */
  const focusAfterRemoval = (removed: WaitlistEntry) => {
    const index = displayEntries.findIndex((e) => e.id === removed.id);
    const next = displayEntries[index + 1];
    if (next) {
      focusAfter({ kind: "testId", testId: `waitlist-entry-${next.id}` });
    } else if (displayEntries.length <= 1) {
      focusAfter({ kind: "testId", testId: "waitlist-empty" });
    } else {
      focusAfter({ kind: "pageHeading" });
    }
  };

  const handleAdded = (entry: WaitlistEntry) => {
    announce(`Added ${entry.guestName}, party of ${entry.partySize}, to the waitlist.`);
    // The one deliberate exception to the opener rule: the Host adding one walk-up is adding the next.
    focusAfter({ kind: "testId", testId: "waitlist-guest-name" });
  };

  const handleNotified = (entry: WaitlistEntry) => {
    announce(`Notified ${entry.guestName}.`);
    // The list is status "waiting" only (the service's listWaiting), so a notified party leaves it
    // on the refetch — opener and row both go, and rule (d) falls through to the next entry.
    focusAfterRemoval(entry);
  };

  const handleCancelled = (entry: WaitlistEntry) => {
    announce(`Removed ${entry.guestName} from the waitlist.`);
    focusAfterRemoval(entry);
  };

  const handleSeated = (entry: WaitlistEntry, reservation: Reservation, tableName: string) => {
    const sentence = `Seated ${entry.guestName} at ${tableName}.`;
    announce(sentence);
    toast({
      variant: "success",
      title: sentence,
      action: {
        label: "View on Timeline",
        onClick: () =>
          navigate(`/timeline?date=${localDateString(new Date())}&selected=${reservation.id}`),
      },
    });
    focusAfterRemoval(entry);
  };

  if (isLoading && displayEntries.length === 0) {
    return <WaitlistLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title="Waitlist" description="Guests waiting for a table" />
      <LiveStatus status={status} />

      {loadFailure && (
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <ErrorRetryBanner
            title="Couldn't load the waitlist."
            error={loadFailure.detail}
            details={loadFailure.raw}
            onRetry={refetch}
          />
        </div>
      )}

      {selectedVenueId && (
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <AddToWaitlistForm venueId={selectedVenueId} onAdded={handleAdded} />
        </div>
      )}

      {!isLoading && !loadFailure && displayEntries.length === 0 && (
        // tabIndex={-1}: the focus target after the last entry is seated or removed (rule (d)).
        <div tabIndex={-1} data-testid="waitlist-empty">
          <EmptyState heading="No one waiting" description="The waitlist is currently empty." />
        </div>
      )}

      {!isLoading && !loadFailure && displayEntries.length > 0 && (
        <div className={styles.cards}>
          {displayEntries.map((entry) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
              tables={tables ?? []}
              venueId={selectedVenueId ?? ""}
              onNotified={handleNotified}
              onCancelled={handleCancelled}
              onSeated={handleSeated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
