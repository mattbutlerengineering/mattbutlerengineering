import { useState, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Skeleton,
  SkeletonGroup,
  Stack,
  Tag,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import type { GuestRiskScore, Reservation } from "@mbe/types";
import { useGuest, useAddStaffNote } from "../../hooks/useGuests.js";
import { useReservations } from "../../hooks/useReservations.js";
import styles from "./GuestCard.module.css";

/* ── Constants ───────────────────────────────────────── */

const ALLERGY_KEYWORDS = ["nut", "shellfish", "dairy"];

const OCCASION_LABELS: Record<string, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  business: "Business",
  date_night: "Date Night",
  other: "Special Occasion",
};

/* ── Helpers ─────────────────────────────────────────── */

function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getSegmentLabel(visitCount: number, tags: string[] | null): string {
  const tagList = tags ?? [];
  if (tagList.includes("vip") || visitCount >= 10) return "VIP";
  if (visitCount >= 2) return "Repeat";
  return "New";
}

function getSegmentVariant(label: string): "accent" | "success" | "neutral" {
  if (label === "VIP") return "accent";
  if (label === "Repeat") return "success";
  return "neutral";
}

function getRiskVariant(score: GuestRiskScore): "error" | "warning" | "neutral" {
  if (score === "risky") return "error";
  if (score === "standard") return "warning";
  return "neutral";
}

function getRiskLabel(score: GuestRiskScore): string {
  if (score === "risky") return "Risky";
  if (score === "standard") return "Standard";
  return "Trusted";
}

/* ── Props ───────────────────────────────────────────── */

export interface GuestCardProps {
  guestId: string | null | undefined;
  /** Called when user clicks Edit Profile */
  onEditProfile?: () => void;
}

/* ── Component ───────────────────────────────────────── */

export function GuestCard({ guestId, onEditProfile }: GuestCardProps) {
  const { data: guest, isLoading, error, refetch } = useGuest(guestId);

  const { data: reservations = [] } = useReservations({
    guestId: guestId ?? undefined,
    limit: 20,
    enabled: !!guestId,
  });

  const addNoteMutation = useAddStaffNote();

  const [showAllNotes, setShowAllNotes] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  const handleSaveNote = useCallback(async () => {
    if (!guestId || !noteText.trim()) return;
    await addNoteMutation.mutateAsync({ guestId, text: noteText.trim() });
    setNoteText("");
    setAddingNote(false);
  }, [guestId, noteText, addNoteMutation]);

  const handleCancelNote = useCallback(() => {
    setNoteText("");
    setAddingNote(false);
  }, []);

  // Null guestId → render nothing
  if (!guestId) return null;

  if (isLoading) {
    return (
      <Card data-testid="guest-card-loading">
        <SkeletonGroup>
          <Stack gap="md">
            <Skeleton variant="text" width="60%" height={20} />
            <Skeleton variant="text" width="40%" height={16} />
            <Skeleton variant="text" width="80%" height={16} />
          </Stack>
        </SkeletonGroup>
      </Card>
    );
  }

  if (error || !guest) {
    return (
      <Card data-testid="guest-card-error">
        <Stack gap="md">
          <Alert variant="error">Failed to load guest profile.</Alert>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </Stack>
      </Card>
    );
  }

  /* ── Derived data ─────────────────────────────────── */

  const segmentLabel = getSegmentLabel(guest.visitCount, guest.tags);
  const segmentVariant = getSegmentVariant(segmentLabel);

  const allergyRestrictions = (guest.dietaryRestrictions ?? []).filter((r) =>
    ALLERGY_KEYWORDS.some((kw) => r.toLowerCase().includes(kw))
  );

  const sortedNotes = [...(guest.staffNotes ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const visibleNotes = showAllNotes ? sortedNotes : sortedNotes.slice(0, 3);
  const hasMoreNotes = sortedNotes.length > 3;

  const occasionReservations = (reservations as Reservation[]).filter(
    (r) => r.occasion && r.occasion !== "none"
  );

  /* ── Render ───────────────────────────────────────── */

  return (
    <Card className={styles.guestCard}>
      <Stack gap="lg">
        {/* Header */}
        <Stack gap="xs">
          <Stack direction="row" gap="sm" align="center" wrap>
            <Text variant="display">{guest.name}</Text>
            <Badge variant={segmentVariant}>{segmentLabel}</Badge>
          </Stack>
          <Text variant="caption" color="secondary">
            {guest.visitCount} {guest.visitCount === 1 ? "visit" : "visits"}
          </Text>
        </Stack>

        {/* No-show risk indicator */}
        {guest.noShowCount > 0 && (
          <div data-testid="no-show-risk">
            <Stack direction="row" gap="sm" align="center">
              <Text variant="caption" color="secondary">
                {guest.noShowCount} no-show{guest.noShowCount === 1 ? "" : "s"}
              </Text>
              <Badge variant={getRiskVariant(guest.riskScore)}>
                {getRiskLabel(guest.riskScore)}
              </Badge>
            </Stack>
          </div>
        )}

        {/* Allergy warning banner */}
        {allergyRestrictions.length > 0 && (
          <div data-testid="allergy-warning-banner">
            <Alert variant="warning" title="Allergy Alert">
              {allergyRestrictions.join(", ")}
            </Alert>
          </div>
        )}

        {/* Dietary restrictions */}
        {guest.dietaryRestrictions && guest.dietaryRestrictions.length > 0 && (
          <>
            <Divider />
            <Stack gap="xs" data-testid="dietary-restrictions">
              <Text variant="label" color="secondary">
                Dietary Restrictions
              </Text>
              <Stack direction="row" gap="xs" wrap>
                {guest.dietaryRestrictions.map((restriction) => (
                  <Tag key={restriction}>{restriction}</Tag>
                ))}
              </Stack>
            </Stack>
          </>
        )}

        {/* Contact */}
        <Divider />
        <Stack gap="xs">
          <Text variant="label" color="secondary">
            Contact
          </Text>
          {/* mailto/tel anchors — no Rialto equivalent */}
          {guest.email && (
            <a href={`mailto:${guest.email}`} className={styles.contactLink}>
              <Text variant="body">{guest.email}</Text>
            </a>
          )}
          {guest.phone && (
            <a href={`tel:${guest.phone}`} className={styles.contactLink}>
              <Text variant="body">{guest.phone}</Text>
            </a>
          )}
        </Stack>

        {/* Occasion history */}
        {occasionReservations.length > 0 && (
          <>
            <Divider />
            <Stack gap="xs" data-testid="occasion-history">
              <Text variant="label" color="secondary">
                Occasion History
              </Text>
              {occasionReservations.map((r) => (
                <Text key={r.id} variant="caption" color="secondary">
                  {OCCASION_LABELS[r.occasion!] ?? r.occasion} &mdash; {formatShortDate(r.date)}
                </Text>
              ))}
            </Stack>
          </>
        )}

        {/* Staff notes */}
        {sortedNotes.length > 0 && (
          <>
            <Divider />
            <Stack gap="sm" data-testid="staff-notes">
              <Text variant="label" color="secondary">
                Staff Notes
              </Text>
              {visibleNotes.map((note, idx) => (
                <Stack key={idx} gap="xs" className={styles.noteItem}>
                  <Text variant="caption" color="secondary">
                    {new Date(note.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                  <Text variant="body">{note.text}</Text>
                </Stack>
              ))}
              {hasMoreNotes && !showAllNotes && (
                <Button variant="ghost" onClick={() => setShowAllNotes(true)}>
                  Show All ({sortedNotes.length})
                </Button>
              )}
            </Stack>
          </>
        )}

        {/* Add note inline action */}
        <Divider />
        {addingNote ? (
          <Stack gap="sm">
            <TextArea
              label="New Staff Note"
              placeholder="Type a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              disabled={addNoteMutation.isPending}
            />
            <Stack direction="row" gap="sm" justify="end">
              <Button
                variant="ghost"
                onClick={handleCancelNote}
                disabled={addNoteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveNote}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                isLoading={addNoteMutation.isPending}
                loadingText="Saving..."
              >
                Save Note
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" wrap>
            <Button variant="secondary" onClick={() => setAddingNote(true)}>
              Add Note
            </Button>
            {onEditProfile && (
              <Button variant="ghost" onClick={onEditProfile}>
                Edit Profile
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
