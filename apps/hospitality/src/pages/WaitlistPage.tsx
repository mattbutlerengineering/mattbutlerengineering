import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import type { Guest, Reservation, Table, WaitlistEntry } from "@mbe/types";
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
import { useStaffTonight } from "../hooks/useStaffTonight.js";
import { useVenueTeam } from "../hooks/useVenueTeam.js";
import { WaitlistClosedNotice } from "../components/waitlist/WaitlistClosedNotice.js";
import { waitlistClosingRule } from "../utils/tonight-blocks.js";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { LiveStatus } from "../components/LiveStatus.js";
import { GuestLookup } from "../components/crm/GuestLookup.js";
import { GuestHistoryStrip } from "../components/crm/GuestHistoryStrip.js";
import { pickAnnouncement } from "../components/crm/guest-lookup-rows.js";
import { applyClear, applyPick, type PrefillSnapshot } from "../components/crm/guest-prefill.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { deviceDate } from "../utils/service-day.js";
import { tablesThatFit } from "../utils/seating.js";
import styles from "./WaitlistPage.module.css";

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The recognised guest plus what the phone field held before prefill, so Clear can restore it. */
interface RecognisedGuest {
  guest: Guest;
  snapshot: PrefillSnapshot;
}

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
  const { t } = useTranslation();
  return (
    <div className={styles.container}>
      <PageHeader title={t("waitlist.title")} description={t("waitlist.description")} />
      <SkeletonGroup>
        <Skeleton variant="card" width="100%" height={100} />
        <Skeleton variant="card" width="100%" height={100} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Wait time formatter ─────────────────────────── */

function formatWait(minutes: number | null, t: TFunction): string {
  return minutes === null ? t("waitlist.row.waitUnavailable") : t("waitlist.row.wait", { minutes });
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
  announce,
}: {
  venueId: string;
  onAdded: (entry: WaitlistEntry) => void;
  /** The page's polite region: pick and Clear are spoken there, like every other outcome. */
  announce: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { mutateAsync: createEntry, isPending } = useCreateWaitlistEntry();
  const [partySize, setPartySize] = useState(2);
  const [submitFailure, setSubmitFailure] = useState<ActionFailure | null>(null);
  // Recognition only prefills: the payload never carries the guest's id (SC9).
  const [recognised, setRecognised] = useState<RecognisedGuest | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<WaitlistFormData>({
    defaultValues: { guestName: "", guestPhone: "" },
  });
  const guestName = watch("guestName");

  const handlePick = (guest: Guest) => {
    setValue("guestName", guest.name);
    const { next, snapshot } = applyPick(
      { guestPhone: getValues("guestPhone") },
      { email: guest.email, phone: guest.phone }
    );
    setValue("guestPhone", next.guestPhone);
    setRecognised({ guest, snapshot });
    announce(pickAnnouncement("recognised", guest, t));
  };

  const handleClear = () => {
    if (!recognised) return;
    const restored = applyClear({ guestPhone: getValues("guestPhone") }, recognised.snapshot);
    setValue("guestPhone", restored.guestPhone);
    setRecognised(null);
    // The typed name stays; selecting it makes "type a different name" a single keystroke.
    setFocus("guestName", { shouldSelect: true });
    announce(t("waitlist.form.guestCleared"));
  };

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
      setRecognised(null);
      onAdded(entry);
    } catch (err) {
      setSubmitFailure(actionFailure(t("waitlist.form.notAdded"), err));
    }
  };

  const validationMessage = errors.guestName?.message ?? errors.guestPhone?.message;

  return (
    <Card>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <Text variant="label" color="secondary">
            {t("waitlist.form.heading")}
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
            <GuestLookup
              venueId={venueId}
              label={t("waitlist.form.guestName")}
              hint={t("waitlist.form.nameHint")}
              placeholder={t("waitlist.form.namePlaceholder")}
              query={guestName}
              picked={recognised?.guest ?? null}
              onPick={handlePick}
              onClear={handleClear}
              announce={announce}
              disabled={isPending}
              data-testid="waitlist-guest-name"
              {...register("guestName", { required: t("waitlist.form.nameRequired") })}
            />
            <Input
              label={t("waitlist.form.guestPhone")}
              type="tel"
              placeholder="(555) 123-4567"
              disabled={isPending}
              {...register("guestPhone", {
                required: t("waitlist.form.phoneRequired"),
                validate: (value) => isValidGuestPhone(value) || t("waitlist.form.phoneInvalid"),
              })}
            />
          </div>
          {recognised && (
            <GuestHistoryStrip guest={recognised.guest} mode="recognised" onClear={handleClear} />
          )}

          <div>
            <Text
              variant="label"
              color="secondary"
              style={{ marginBottom: "var(--rialto-space-xs)" }}
            >
              {t("waitlist.form.partySize")}
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
            loadingText={t("waitlist.form.adding")}
            style={{ alignSelf: "flex-start" }}
          >
            {t("waitlist.form.submit")}
          </Button>
        </Stack>
      </form>
    </Card>
  );
}

/* ── Table selection for seating ─────────────────────── */

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
  const { t } = useTranslation();
  const { mutateAsync: notify, isPending: isNotifying } = useNotifyWaitlistEntry();
  const { mutateAsync: cancelEntry, isPending: isCancelling } = useCancelWaitlistEntry();
  const { mutateAsync: markSeated } = useSeatWaitlistEntry();
  const api = useApiClient();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [isSeating, setIsSeating] = useState(false);

  const availableTables = tablesThatFit(tables, entry.partySize);
  const availableTableIds = availableTables.map((table) => table.id).join(",");
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
    if (!tableId || !availableTables.some((table) => table.id === tableId)) {
      setTableId(availableTables[0]?.id ?? "");
    }
  }

  const handleNotify = async () => {
    setFailure(null);
    try {
      await notify(entry.id);
      onNotified(entry);
    } catch (err) {
      setFailure(actionFailure(t("waitlist.row.notNotified"), err));
    }
  };

  const handleCancel = async () => {
    setFailure(null);
    try {
      await cancelEntry(entry.id);
      onCancelled(entry);
    } catch (err) {
      setFailure(actionFailure(t("waitlist.row.notRemoved"), err));
    }
  };

  const handleSeat = async () => {
    if (!tableId) {
      setFailure({ detail: t("waitlist.row.selectTable") });
      return;
    }
    setFailure(null);
    setIsSeating(true);
    const tableName =
      availableTables.find((table) => table.id === tableId)?.name ?? t("waitlist.row.theTable");
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
              detail: t("waitlist.row.splitFailure", { table: tableName }),
              raw: describeApiError(err).raw,
            }
          : actionFailure(t("waitlist.row.notSeated"), err)
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
            {t("waitlist.row.party", { size: entry.partySize })}
          </Text>
          {failure && (
            <ErrorRetryBanner title={failure.title} error={failure.detail} details={failure.raw} />
          )}
        </div>
        <Text variant="caption" color="secondary">
          {formatWait(entry.estimatedWaitMinutes, t)}
        </Text>
        {entry.notifiedAt && (
          <Badge variant="success" size="sm">
            {t("waitlist.row.notified")}
          </Badge>
        )}
        <div className={styles.actions}>
          {availableTables.length > 0 ? (
            <Select
              label={t("waitlist.row.table")}
              value={tableId}
              onChange={setTableId}
              disabled={isSeating}
              options={availableTables.map((table) => ({
                value: table.id,
                label: t("waitlist.row.tableOption", {
                  name: table.name,
                  capacity: table.capacity,
                }),
              }))}
            />
          ) : (
            <Text variant="caption" color="secondary">
              {t("waitlist.row.noTables")}
            </Text>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSeat}
            isLoading={isSeating}
            loadingText={t("waitlist.row.seating")}
            disabled={availableTables.length === 0}
          >
            {t("waitlist.row.seat")}
          </Button>
          {!entry.notifiedAt && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNotify}
              isLoading={isNotifying}
              loadingText={t("waitlist.row.notifying")}
            >
              {t("waitlist.row.notify")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            isLoading={isCancelling}
            loadingText={t("waitlist.row.cancelling")}
          >
            {t("waitlist.row.cancel")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ── Main component ─────────────────────────────────── */

export function WaitlistPage() {
  const { t } = useTranslation();
  const { selectedVenueId } = useVenue();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { status, announce } = useStatusMessage();
  const { focusAfter } = useFocusAfter();
  const addToWaitlistFormRef = useRef<HTMLDivElement>(null);
  const focusAddToWaitlistForm = () => {
    const container = addToWaitlistFormRef.current;
    container?.scrollIntoView({ behavior: "smooth", block: "center" });
    container?.querySelector("input")?.focus();
  };
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

  const tonight = useStaffTonight(selectedVenueId);
  const { data: team } = useVenueTeam({ venueId: selectedVenueId });
  const closingRule = tonight.serviceDate
    ? waitlistClosingRule(tonight.rules, tonight.serviceDate)
    : null;

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
    announce(t("waitlist.announce.added", { name: entry.guestName, size: entry.partySize }));
    // The one deliberate exception to the opener rule: the Host adding one walk-up is adding the next.
    focusAfter({ kind: "testId", testId: "waitlist-guest-name" });
  };

  const handleNotified = (entry: WaitlistEntry) => {
    announce(t("waitlist.announce.notified", { name: entry.guestName }));
    // The list is status "waiting" only (the service's listWaiting), so a notified party leaves it
    // on the refetch — opener and row both go, and rule (d) falls through to the next entry.
    focusAfterRemoval(entry);
  };

  const handleCancelled = (entry: WaitlistEntry) => {
    announce(t("waitlist.announce.removed", { name: entry.guestName }));
    focusAfterRemoval(entry);
  };

  const handleSeated = (entry: WaitlistEntry, reservation: Reservation, tableName: string) => {
    const sentence = t("waitlist.announce.seated", { name: entry.guestName, table: tableName });
    announce(sentence);
    toast({
      variant: "success",
      title: sentence,
      action: {
        label: t("waitlist.announce.viewOnTimeline"),
        onClick: () =>
          navigate(`/timeline?date=${deviceDate(new Date())}&selected=${reservation.id}`),
      },
    });
    focusAfterRemoval(entry);
  };

  if (isLoading && displayEntries.length === 0) {
    return <WaitlistLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title={t("waitlist.title")} description={t("waitlist.description")} />
      <LiveStatus status={status} />

      <div data-testid="primary-content">
        {loadFailure && (
          <div style={{ marginBlock: "var(--rialto-space-md)" }}>
            <ErrorRetryBanner
              title={t("waitlist.loadFailed")}
              error={loadFailure.detail}
              details={loadFailure.raw}
              onRetry={refetch}
            />
          </div>
        )}

        {selectedVenueId && (
          <div ref={addToWaitlistFormRef} style={{ marginBlock: "var(--rialto-space-md)" }}>
            {tonight.waitlistClosed ? (
              <WaitlistClosedNotice
                venueId={selectedVenueId}
                note={closingRule?.staffNote?.trim() || null}
                ruleId={closingRule?.id ?? null}
                canReopen={team?.viewerRole === "manager"}
              />
            ) : (
              <AddToWaitlistForm
                venueId={selectedVenueId}
                onAdded={handleAdded}
                announce={announce}
              />
            )}
          </div>
        )}

        {!isLoading && !loadFailure && displayEntries.length === 0 && (
          // tabIndex={-1}: the focus target after the last entry is seated or removed (rule (d)).
          <div tabIndex={-1} data-testid="waitlist-empty">
            <EmptyState
              heading={t("waitlist.empty.heading")}
              description={t("waitlist.empty.description")}
              action={
                tonight.waitlistClosed ? undefined : (
                  <Button variant="primary" onClick={focusAddToWaitlistForm}>
                    {t("waitlist.empty.add")}
                  </Button>
                )
              }
            />
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
    </div>
  );
}
