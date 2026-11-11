import { useTranslation } from "react-i18next";
import type { InviteRsvpSummary } from "@mbe/types";
import styles from "./InviteRsvpChip.module.css";

export interface InviteRsvpChipProps {
  rsvp: InviteRsvpSummary | null | undefined;
  className?: string;
}

/** "3 of 6 in": how many invitees said IN against the party size. Renders nothing without an invite. */
export function InviteRsvpChip({ rsvp, className }: InviteRsvpChipProps) {
  const { t } = useTranslation();
  if (!rsvp) return null;
  return (
    <span
      data-testid="invite-rsvp-chip"
      className={[styles.chip, className ?? ""].filter(Boolean).join(" ")}
    >
      {t("inviteRsvpChip.text", { in: rsvp.in, total: rsvp.partySize })}
    </span>
  );
}
