import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mattbutlerengineering/rialto";
import { specialRequestsText } from "../../utils/reservation-display.js";
import styles from "./SpecialRequestsTicket.module.css";

export interface SpecialRequestsTicketProps {
  notes: string | null | undefined;
}

/**
 * The host ticket's Special Requests block (desktop sidebar, phone drawer and
 * tablet sheet): the label guests see, a caption quoting what guest pages say
 * about it, and the guest's words in the recessed box. Renders nothing when
 * there is no request.
 *
 * Label and caption follow the staff locale. The caption nests the guest
 * acknowledgement by catalog key, so the host's quote and the guest's sentence
 * cannot diverge in any locale (PRD SC4).
 */
export function SpecialRequestsTicket({ notes }: SpecialRequestsTicketProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const requests = specialRequestsText(notes);
  if (requests === null) return null;

  return (
    <Stack gap="2xs" role="group" aria-labelledby={labelId}>
      <Text id={labelId} variant="label" color="secondary">
        {t("bookingWidget.specialRequests.label")}
      </Text>
      <Text variant="caption" color="secondary" as="div">
        {t("bookingWidget.specialRequests.hostCaption")}
      </Text>
      <Text variant="body" as="div" dir="auto" className={styles.notesValue}>
        {requests}
      </Text>
    </Stack>
  );
}
