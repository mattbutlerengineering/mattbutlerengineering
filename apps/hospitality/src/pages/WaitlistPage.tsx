import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Skeleton,
  SkeletonGroup,
  Text,
} from "@mattbutlerengineering/rialto";
import type { WaitlistEntry } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { useWaitlist } from "../hooks/useWaitlist.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./WaitlistPage.module.css";

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

/* ── Waitlist row ─────────────────────────────────── */

function WaitlistRow({ entry }: { entry: WaitlistEntry }) {
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
        </div>
        <Text variant="caption" color="secondary">
          {formatWait(entry.estimatedWaitMinutes)}
        </Text>
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

      {!isLoading && !error && displayEntries.length === 0 && (
        <div aria-live="polite" role="status">
          <EmptyState heading="No one waiting" description="The waitlist is currently empty." />
        </div>
      )}

      {!isLoading && !error && displayEntries.length > 0 && (
        <div className={styles.cards} aria-live="polite">
          {displayEntries.map((entry) => (
            <WaitlistRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
