import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { useBookingRulesUndo } from "../../hooks/useBookingRulesUndo.js";
import { useUpdateVenue } from "../../hooks/useVenues.js";
import { useViewport } from "../../hooks/useViewport.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import {
  invalidBookingRules,
  toBookingRulesForm,
  UNSET_LARGEST_PARTY,
  withBookingRules,
  type BookingRulesField,
  type BookingRulesForm,
} from "./booking-rules.js";
import { LeaveGuard } from "./LeaveGuard.js";
import styles from "./ScheduleFormParts.module.css";

export interface BookingRulesDrawerProps {
  /** Leaves the drawer's address. With an unsaved change the leave guard asks first. */
  readonly onClose: () => void;
}

/**
 * Availability → Booking rules: how far ahead guests can book, the least notice they must give,
 * and the largest party that can book online. Onboarding asked once; this is where a Manager
 * changes them afterwards. An empty field means "not set" and says what then applies.
 *
 * A save offers Undo for 10 seconds (`useBookingRulesUndo`); nothing here reaches History.
 */
export function BookingRulesDrawer({ onClose }: BookingRulesDrawerProps) {
  const { t } = useTranslation();
  const viewport = useViewport();
  const { selectedVenue, selectedVenueId } = useVenue();
  const update = useUpdateVenue();
  const offerUndo = useBookingRulesUndo();
  // What the form is compared with: the stored rules on open, then the rules last saved.
  const [saved, setSaved] = useState(() => toBookingRulesForm(selectedVenue?.settings));
  const [form, setForm] = useState<BookingRulesForm>(saved);
  const [failure, setFailure] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const invalid = invalidBookingRules(form);
  const dirty = (Object.keys(form) as BookingRulesField[]).some((k) => form[k] !== saved[k]);

  /** Saves the draft and offers Undo; false when nothing was saved, with the reason shown. */
  const save = async (): Promise<boolean> => {
    if (!selectedVenueId || invalid.length > 0) return false;
    setFailure(null);
    // The three values this save replaces, which Undo puts back.
    const previous = toBookingRulesForm(selectedVenue?.settings);
    try {
      await update.mutateAsync({
        venueId: selectedVenueId,
        data: { settings: withBookingRules(selectedVenue?.settings, form) },
      });
    } catch (error) {
      setFailure(describeApiError(error).detail);
      return false;
    }
    offerUndo({ venueId: selectedVenueId, previous });
    return true;
  };

  const saveAndClose = async () => {
    if (!(await save())) return;
    setSaved(form);
    setLeaving(true);
  };
  // After the commit that made the draft clean, so the leave guard has stood down by then.
  useEffect(() => {
    if (leaving) onClose();
  }, [leaving, onClose]);

  const field = (key: BookingRulesField, label: string, placeholder: string, hint: string) => (
    <Input
      type="number"
      inputMode="numeric"
      label={label}
      value={form[key]}
      placeholder={placeholder}
      error={invalid.includes(key)}
      hint={invalid.includes(key) ? t(`availability.bookingRules.invalid.${key}`) : hint}
      showOptional
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
    />
  );

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={t("availability.bookingRules.title")}
        description={t("availability.bookingRules.description")}
        size={viewport === "phone" ? "full" : "default"}
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" onClick={onClose}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!dirty || invalid.length > 0}
              isLoading={update.isPending}
              onClick={() => void saveAndClose()}
            >
              {t("availabilitySchedules.save")}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          {failure && (
            <Alert variant="error" title={t("availability.bookingRules.saveError")}>
              {failure}
            </Alert>
          )}
          {field(
            "daysAhead",
            t("availability.bookingRules.daysAhead"),
            t("availability.bookingRules.noLimit"),
            t("availability.bookingRules.daysAheadHint")
          )}
          {field(
            "noticeHours",
            t("availability.bookingRules.noticeHours"),
            t("availability.bookingRules.noNotice"),
            t("availability.bookingRules.noticeHoursHint")
          )}
          {field(
            "largestParty",
            t("availability.bookingRules.largestParty"),
            t("availability.bookingRules.partyDefault", { count: UNSET_LARGEST_PARTY }),
            t("availability.bookingRules.largestPartyHint")
          )}
          <Text variant="caption" color="secondary">
            {t("availabilityHub.bookingRules.notInHistory")}
          </Text>
        </Stack>
      </Drawer>
      {/* After the drawer, so its prompt opens above it. Its Save is offered only while the draft
          can be saved: a refused save would close the prompt with nothing saved and nothing said. */}
      <LeaveGuard
        active={dirty}
        date={null}
        title={t("availabilitySchedules.discard.title")}
        {...(invalid.length === 0 && { onSave: save })}
      />
    </>
  );
}
