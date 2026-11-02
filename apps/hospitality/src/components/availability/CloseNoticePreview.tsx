import { useTranslation } from "react-i18next";
import { Button, Skeleton, Stack, Text } from "@mattbutlerengineering/rialto";
import type {
  ClosureImpactGroup,
  ClosureImpactReservation,
  ClosureNoticePreviewBody,
} from "@mbe/types";
import { useClosureNoticePreview } from "../../hooks/useClosures.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "./CloseDialog.module.css";

export type NoticeAction = ClosureNoticePreviewBody["action"];

/**
 * The request for the message a group's guests would get: its first booking's details (for a move,
 * the first with a proposed time), with the venue's own message. Null when no booking can show it.
 */
function noticeRequest(
  group: ClosureImpactGroup,
  action: NoticeAction,
  guestMessage: string
): { readonly body: ClosureNoticePreviewBody; readonly sample: ClosureImpactReservation } | null {
  const sample =
    action === "move" ? group.reservations.find((r) => r.proposedStart) : group.reservations[0];
  const startTime = action === "move" ? sample?.proposedStart : sample?.startTime;
  if (!sample || !startTime) return null;
  return {
    sample,
    body: {
      action,
      closureDate: group.date,
      startTime,
      partySize: sample.partySize,
      guestName: sample.guestName,
      message: guestMessage.trim() === "" ? null : guestMessage.trim(),
      refund: action === "cancel" ? sample.deposit : null,
      originHost: sample.originHost ?? null,
    },
  };
}

function Rendered(props: {
  readonly venueId: string;
  readonly body: ClosureNoticePreviewBody;
  readonly sample: ClosureImpactReservation;
}) {
  const { venueId, body, sample } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const query = useClosureNoticePreview({ venueId, body });

  if (query.error) {
    return (
      <Stack gap="sm">
        <Text role="alert" variant="body" color="primary">
          {t("availability.close.step2.previewFailed")}
        </Text>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t("availability.close.step2.previewRetry")}
        </Button>
      </Stack>
    );
  }
  if (!query.data) return <Skeleton variant="text" width="60%" />;

  const { email, sms } = query.data;
  return (
    <Stack gap="sm">
      <Text variant="caption" color="secondary">
        {t("availability.close.step2.previewFor", {
          name: sample.guestName ?? t("availability.close.step2.guestUnnamed"),
          time: format.formatTime(sample.startTime),
        })}
      </Text>
      <Text variant="body" color="primary" className={styles.preview}>
        <strong>{t("availability.close.step2.previewEmail")}</strong>
        {`\n${t("availability.close.step2.previewFrom", { from: email.from })}\n${email.subject}\n${email.text}`}
      </Text>
      <Text variant="body" color="primary" className={styles.preview}>
        <strong>{t("availability.close.step2.previewSms")}</strong>
        {`\n${sms}`}
      </Text>
      <Text variant="caption" color="secondary">
        {t("availability.close.step2.previewNote")}
      </Text>
    </Stack>
  );
}

/**
 * The email and text a guest would be sent for the chosen outcome, rendered by the server with the
 * builders the notice job sends with (ux.md S7, "Preview message"). It mounts, and so asks, only
 * once the Manager opens the preview.
 */
export function CloseNoticePreview(props: {
  readonly venueId: string;
  readonly group: ClosureImpactGroup;
  readonly action: NoticeAction;
  readonly guestMessage: string;
}) {
  const { venueId, group, action, guestMessage } = props;
  const request = noticeRequest(group, action, guestMessage);
  return request ? (
    <Rendered venueId={venueId} body={request.body} sample={request.sample} />
  ) : null;
}
