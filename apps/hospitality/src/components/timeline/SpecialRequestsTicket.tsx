import { useId } from "react";
import { Stack, Text } from "@mattbutlerengineering/rialto";
import { CONFIRMATION_COPY } from "../../constants/confirmation-copy.js";
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
 */
export function SpecialRequestsTicket({ notes }: SpecialRequestsTicketProps) {
  const labelId = useId();
  const requests = specialRequestsText(notes);
  if (requests === null) return null;

  return (
    <Stack gap="2xs" role="group" aria-labelledby={labelId}>
      <Text id={labelId} variant="label" color="secondary">
        {CONFIRMATION_COPY.specialRequestsLabel}
      </Text>
      <Text variant="caption" color="secondary" as="div">
        {CONFIRMATION_COPY.hostCaption}
      </Text>
      <Text variant="body" as="div" dir="auto" className={styles.notesValue}>
        {requests}
      </Text>
    </Stack>
  );
}
