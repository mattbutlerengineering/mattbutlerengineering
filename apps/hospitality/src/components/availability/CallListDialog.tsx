import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Skeleton, Text } from "@mattbutlerengineering/rialto";
import { useClosureCallList } from "../../hooks/useClosures.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import styles from "./SpecialDatesTab.module.css";

export interface CallListDialogProps {
  readonly venueId: string;
  readonly ruleId: string;
  readonly onClose: () => void;
}

/**
 * The printable call list (ux.md F5 step 8, F6): name, party, time and phone for guests not yet
 * confirmed delivered or rebooked.
 */
export function CallListDialog({ venueId, ruleId, onClose }: CallListDialogProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const list = useClosureCallList({ venueId, ruleId });
  const entries = list.data ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("availabilitySpecial.callList.title")}
      description={t("availabilitySpecial.callList.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("availabilitySpecial.callList.close")}
          </Button>
          <Button variant="primary" onClick={() => window.print()} disabled={entries.length === 0}>
            {t("availabilitySpecial.callList.print")}
          </Button>
        </>
      }
    >
      {list.error ? (
        <Alert variant="error">{describeApiError(list.error).detail}</Alert>
      ) : list.isLoading ? (
        <Skeleton variant="text" lines={3} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="secondary">
          {t("availabilitySpecial.callList.empty")}
        </Text>
      ) : (
        <table className={styles.callList}>
          <thead>
            <tr>
              <th scope="col">{t("availabilitySpecial.callList.name")}</th>
              <th scope="col">{t("availabilitySpecial.callList.party")}</th>
              <th scope="col">{t("availabilitySpecial.callList.time")}</th>
              <th scope="col">{t("availabilitySpecial.callList.phone")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.outcomeId}>
                <td>{entry.guestName ?? t("availabilitySpecial.callList.unnamed")}</td>
                <td>{entry.partySize}</td>
                <td>{format.formatTime(entry.startTime)}</td>
                <td>{entry.guestPhone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}
