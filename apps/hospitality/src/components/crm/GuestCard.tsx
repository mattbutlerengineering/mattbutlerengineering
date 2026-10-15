import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import type { Reservation } from "@mbe/types";
import { useGuest, useAddStaffNote } from "../../hooks/useGuests.js";
import { useReservations } from "../../hooks/useReservations.js";
import {
  isAllergyTag,
  getSegmentLabel,
  getSegmentVariant,
  riskText,
  segmentText,
  getRiskVariant,
} from "./guest-signals.js";
import styles from "./GuestCard.module.css";

/* ── Constants ───────────────────────────────────────── */

const OCCASION_KEYS = {
  birthday: "reservations.occasion.birthday",
  anniversary: "reservations.occasion.anniversary",
  business: "reservations.occasion.business",
  date_night: "reservations.occasion.date_night",
  other: "crm.card.specialOccasion",
} as const;

function isOccasionKey(value: string): value is keyof typeof OCCASION_KEYS {
  return value in OCCASION_KEYS;
}

/* ── Helpers ─────────────────────────────────────────── */

/* ── Props ───────────────────────────────────────────── */

export interface GuestCardProps {
  guestId: string | null | undefined;
  /** Called when user clicks Edit Profile */
  onEditProfile?: () => void;
}

/* ── Component ───────────────────────────────────────── */

export function GuestCard({ guestId, onEditProfile }: GuestCardProps) {
  const { t } = useTranslation();
  const fmt = useVenueFormat();
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
          <Alert variant="error">{t("crm.card.loadFailed")}</Alert>
          <Button variant="secondary" onClick={() => refetch()}>
            {t("crm.card.retry")}
          </Button>
        </Stack>
      </Card>
    );
  }

  /* ── Derived data ─────────────────────────────────── */

  const segmentLabel = getSegmentLabel(guest.visitCount, guest.tags);
  const segmentVariant = getSegmentVariant(segmentLabel);

  const allergyRestrictions = (guest.dietaryRestrictions ?? []).filter(isAllergyTag);

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
            <Badge variant={segmentVariant}>{segmentText(segmentLabel, t)}</Badge>
          </Stack>
          <Text variant="caption" color="secondary">
            {t("crm.visit", { count: guest.visitCount })}
          </Text>
        </Stack>

        {/* No-show risk indicator */}
        {guest.noShowCount > 0 && (
          <div data-testid="no-show-risk">
            <Stack direction="row" gap="sm" align="center">
              <Text variant="caption" color="secondary">
                {t("crm.noShow", { count: guest.noShowCount })}
              </Text>
              <Badge variant={getRiskVariant(guest.riskScore)}>
                {riskText(guest.riskScore, t)}
              </Badge>
            </Stack>
          </div>
        )}

        {/* Allergy warning banner */}
        {allergyRestrictions.length > 0 && (
          <div data-testid="allergy-warning-banner">
            <Alert variant="warning" title={t("crm.card.allergyAlert")}>
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
                {t("crm.card.dietary")}
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
            {t("crm.card.contact")}
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
                {t("crm.card.occasionHistory")}
              </Text>
              {occasionReservations.map((r) => (
                <Text key={r.id} variant="caption" color="secondary">
                  {isOccasionKey(r.occasion!) ? t(OCCASION_KEYS[r.occasion!]) : r.occasion} &mdash;{" "}
                  {fmt.formatCalendarDate(r.date, { month: "short", day: "numeric" })}
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
                {t("crm.card.staffNotes")}
              </Text>
              {visibleNotes.map((note, idx) => (
                <Stack key={idx} gap="xs" className={styles.noteItem}>
                  <Text variant="caption" color="secondary">
                    {fmt.formatInstant(note.createdAt, {
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
                  {t("crm.card.showAll", { count: sortedNotes.length })}
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
              label={t("crm.card.newNote")}
              placeholder={t("crm.card.notePlaceholder")}
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
                {t("crm.card.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveNote}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                isLoading={addNoteMutation.isPending}
                loadingText={t("crm.card.saving")}
              >
                {t("crm.card.saveNote")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" wrap>
            <Button variant="secondary" onClick={() => setAddingNote(true)}>
              {t("crm.card.addNote")}
            </Button>
            {onEditProfile && (
              <Button variant="ghost" onClick={onEditProfile}>
                {t("crm.card.editProfile")}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
