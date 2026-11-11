import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack, TextArea } from "@mattbutlerengineering/rialto";
import type { VenueSettings } from "@mbe/types";
import { TONIGHT_NOTE_MAX_LENGTH } from "@mbe/types/schemas";
import { useVenue } from "../../contexts/VenueContext.js";
import { useUpdateVenue } from "../../hooks/useVenues.js";
import { useVenueTeam } from "../../hooks/useVenueTeam.js";
import { describeApiError } from "../../lib/describe-api-error.js";

type SavePhase = "idle" | "saving" | "saved" | "failed";

/** Rebuilds `settings` with the note; an empty note drops the key. */
function withTonightNote(settings: VenueSettings | null, note: string): VenueSettings {
  const { tonightNote: _replaced, ...rest } = settings ?? {};
  return note.length > 0 ? { ...rest, tonightNote: note } : { ...rest };
}

/**
 * Owner editor for `Venue.settings.tonightNote`, the line guests see on the
 * night-of manage page. Hidden for non-owners; the API enforces the same rule.
 */
export function TonightNoteCard() {
  const { t } = useTranslation();
  const { selectedVenue, selectedVenueId } = useVenue();
  const updateVenueMutation = useUpdateVenue();
  const team = useVenueTeam({ venueId: selectedVenueId });
  const isOwner = team.data?.members.some((m) => m.isViewer && m.isOwner) ?? false;

  const [note, setNote] = useState(selectedVenue?.settings?.tonightNote ?? "");
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [seededVenueId, setSeededVenueId] = useState(selectedVenueId);
  if (selectedVenueId !== seededVenueId) {
    setSeededVenueId(selectedVenueId);
    setNote(selectedVenue?.settings?.tonightNote ?? "");
    setPhase("idle");
    setSaveError(null);
  }

  if (!selectedVenueId || !isOwner) return null;

  const handleSave = async () => {
    setPhase("saving");
    setSaveError(null);
    try {
      await updateVenueMutation.mutateAsync({
        venueId: selectedVenueId,
        data: { settings: withTonightNote(selectedVenue?.settings ?? null, note.trim()) },
      });
      setPhase("saved");
    } catch (err) {
      setSaveError(describeApiError(err).detail);
      setPhase("failed");
    }
  };

  const isSaving = phase === "saving";

  return (
    <Card title={t("settings.tonightNote.title")}>
      <Stack gap="md">
        {phase === "saved" && <Alert variant="success">{t("settings.tonightNote.saved")}</Alert>}
        {phase === "failed" && saveError && <Alert variant="error">{saveError}</Alert>}
        <TextArea
          label={t("settings.tonightNote.label")}
          hint={t("settings.tonightNote.hint", { max: TONIGHT_NOTE_MAX_LENGTH })}
          maxLength={TONIGHT_NOTE_MAX_LENGTH}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setPhase("idle");
          }}
          disabled={isSaving}
        />
        <Stack direction="row" gap="sm" justify="end">
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("settings.tonightNote.saving") : t("settings.tonightNote.save")}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
