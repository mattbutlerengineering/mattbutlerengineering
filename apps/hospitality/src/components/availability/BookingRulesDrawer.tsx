import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Drawer, Input, Stack, useToast } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { useUpdateVenue } from "../../hooks/useVenues.js";
import { useViewport } from "../../hooks/useViewport.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import {
  invalidBookingRule,
  toBookingRulesForm,
  UNSET_LARGEST_PARTY,
  withBookingRules,
  type BookingRulesField,
  type BookingRulesForm,
} from "./booking-rules.js";
import styles from "./ScheduleFormParts.module.css";

export interface BookingRulesDrawerProps {
  readonly onClose: () => void;
}

/**
 * Availability → Booking rules: how far ahead guests can book, the least notice they must give,
 * and the largest party that can book online. Onboarding asked once; this is where a Manager
 * changes them afterwards. An empty field means "not set" and says what then applies.
 */
export function BookingRulesDrawer({ onClose }: BookingRulesDrawerProps) {
  const { t } = useTranslation();
  const viewport = useViewport();
  const { toast } = useToast();
  const { selectedVenue, selectedVenueId } = useVenue();
  const update = useUpdateVenue();
  const [initial] = useState(() => toBookingRulesForm(selectedVenue?.settings));
  const [form, setForm] = useState<BookingRulesForm>(initial);
  const [failure, setFailure] = useState<string | null>(null);
  const invalid = invalidBookingRule(form);
  const dirty = (Object.keys(form) as BookingRulesField[]).some((k) => form[k] !== initial[k]);

  const save = async () => {
    if (!selectedVenueId || invalid) return;
    setFailure(null);
    try {
      await update.mutateAsync({
        venueId: selectedVenueId,
        data: { settings: withBookingRules(selectedVenue?.settings, form) },
      });
      toast({ title: t("availability.bookingRules.saved"), variant: "success" });
      onClose();
    } catch (error) {
      setFailure(describeApiError(error).detail);
    }
  };

  const field = (key: BookingRulesField, label: string, placeholder: string, hint: string) => (
    <Input
      type="number"
      inputMode="numeric"
      label={label}
      value={form[key]}
      placeholder={placeholder}
      error={invalid === key}
      hint={invalid === key ? t(`availability.bookingRules.invalid.${key}`) : hint}
      showOptional
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
    />
  );

  return (
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
            disabled={!dirty || invalid !== null}
            isLoading={update.isPending}
            onClick={() => void save()}
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
      </Stack>
    </Drawer>
  );
}
