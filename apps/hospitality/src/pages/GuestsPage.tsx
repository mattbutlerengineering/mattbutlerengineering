import { useState } from "react";
import { z } from "zod";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Input,
  Skeleton,
  SkeletonGroup,
  Stack,
  Stat,
  Text,
} from "@mattbutlerengineering/rialto";
import { ApiClientError } from "@mbe/api-client";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import type { GuestSegment } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader";
import { useGuestDirectory, type UseGuestDirectoryResult } from "../hooks/useGuestDirectory.js";
import { useReservations } from "../hooks/useReservations.js";
import { useFormState } from "../hooks/use-form-state.js";
import { GuestTable } from "../components/crm/GuestTable.js";
import { GuestDrawer } from "../components/crm/GuestDrawer.js";
import { SearchOrchestrator } from "../components/crm/SearchOrchestrator.js";
import styles from "./GuestsPage.module.css";

/* ── Constants ─────────────────────────────── */

const SEGMENT_ACCENT_COLORS = [
  "var(--rialto-accent)",
  "var(--rialto-success)",
  "var(--rialto-warning)",
  "var(--rialto-text-secondary)",
  "var(--rialto-error)",
  "var(--rialto-info, var(--rialto-accent))",
] as const;

/* ── Schema ─────────────────────────────────── */

const guestFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address").or(z.literal("")),
  phone: z
    .string()
    .regex(/^[+\d\s\-().]{7,}$/, "Please enter a valid phone number")
    .or(z.literal("")),
  notes: z.string(),
});

type GuestFormValues = z.infer<typeof guestFormSchema>;

const ADD_GUEST_INITIAL: GuestFormValues = { name: "", email: "", phone: "", notes: "" };

/* ── Loading skeleton ───────────────────────── */

function GuestsLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Guests" description="Manage your guest directory" />
      <SkeletonGroup>
        <div className={styles.segmentsGrid}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="card" width="100%" height={80} />
          ))}
        </div>
        <Skeleton variant="card" width="100%" height={300} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Add Guest Dialog ──────────────────────── */

interface AddGuestDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: GuestFormValues) => Promise<void>;
}

function AddGuestDialog({ open, onClose, onSubmit }: AddGuestDialogProps) {
  const { fields, setField, isPending, error, reset, handleSubmit } = useFormState(
    ADD_GUEST_INITIAL,
    onSubmit,
    guestFormSchema
  );

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add Guest"
      footer={
        <Stack direction="row" gap="sm" justify="end">
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isPending || fields.name.trim().length === 0}
          >
            {isPending ? "Adding..." : "Add Guest"}
          </Button>
        </Stack>
      }
    >
      <Stack gap="md">
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Name"
          type="text"
          placeholder="Full name"
          value={fields.name}
          onChange={(e) => setField("name", e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          placeholder="guest@example.com"
          value={fields.email}
          onChange={(e) => setField("email", e.target.value)}
        />
        <Input
          label="Phone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          value={fields.phone}
          onChange={(e) => setField("phone", e.target.value)}
        />
        <Input
          label="Notes"
          type="text"
          placeholder="Preferences, allergies, etc."
          value={fields.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
      </Stack>
    </Dialog>
  );
}

/* ── Main component ─────────────────────────── */

// Allow injecting a fake hook in tests
export interface GuestsPageProps {
  _useGuestDirectory?: (params: { venueId: string | null | undefined }) => UseGuestDirectoryResult;
}

export function GuestsPage({ _useGuestDirectory }: GuestsPageProps = {}) {
  const { selectedVenueId } = useVenue();

  const directory = (_useGuestDirectory ?? useGuestDirectory)({
    venueId: selectedVenueId,
  });

  const {
    guests,
    segments,
    isLoading,
    error,
    refetch,
    searchQuery,
    setSearchQuery,
    isSearchActive,
    selectedGuest,
    selectedGuestId,
    selectGuest,
    clearSelection,
    addGuest,
    updateGuest,
  } = directory;

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: guestReservations = [], isLoading: historyLoading } = useReservations({
    guestId: selectedGuestId ?? undefined,
    limit: 10,
    enabled: !!selectedGuestId,
  });

  const totalGuestCount = (segments ?? []).reduce(
    (sum: number, s: GuestSegment) => sum + s.count,
    0
  );

  const handleAddGuest = async (data: GuestFormValues) => {
    if (!selectedVenueId) return;
    await addGuest({
      venueId: selectedVenueId,
      name: data.name.trim(),
      ...(data.email.trim() ? { email: data.email.trim() } : {}),
      ...(data.phone.trim() ? { phone: data.phone.trim() } : {}),
    });
    setAddDialogOpen(false);
  };

  if (!selectedVenueId && !isLoading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Guests" description="Manage your guest directory" />
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <Alert variant="warning">Please select a venue to view guests.</Alert>
        </div>
      </div>
    );
  }

  if (isLoading && guests.length === 0) {
    return <GuestsLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <PageHeader title="Guests" description="Manage your guest directory" />
        <SearchOrchestrator
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onAddGuest={() => setAddDialogOpen(true)}
          guestCount={guests.length}
          totalCount={totalGuestCount}
          isSearchActive={isSearchActive}
          isLoading={isLoading}
          isEmpty={!error && guests.length === 0}
        />
      </div>

      {/* Segments Overview */}
      {(segments ?? []).length > 0 && (
        <div className={styles.segmentsGrid}>
          {(segments ?? []).map((segment: GuestSegment, index: number) => (
            <Card
              key={segment.name}
              className={styles.segmentCard}
              style={{
                borderInlineStartColor: SEGMENT_ACCENT_COLORS[index % SEGMENT_ACCENT_COLORS.length],
              }}
            >
              <Stat label={segment.name} value={segment.count} />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <ErrorRetryBanner
          error={error instanceof ApiClientError ? error.problemDetails.detail : error.message}
          onRetry={refetch}
          onDismiss={() => {}}
        />
      )}

      <Text className={styles.srOnly} aria-live="polite" role="status">
        {`${guests.length} guest${guests.length !== 1 ? "s" : ""} shown`}
      </Text>

      {!isLoading && !error && guests.length > 0 && (
        <GuestTable guests={guests} selectedGuestId={selectedGuestId} onRowClick={selectGuest} />
      )}

      <GuestDrawer
        guest={selectedGuest}
        open={selectedGuestId !== null}
        onClose={clearSelection}
        onSave={updateGuest}
        guestReservations={guestReservations}
        isLoadingHistory={historyLoading}
      />

      <AddGuestDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={handleAddGuest}
      />
    </div>
  );
}
