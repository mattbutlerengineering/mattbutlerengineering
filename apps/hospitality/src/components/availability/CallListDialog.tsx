import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { ClosureCallListEntry } from "@mbe/types";
import { useClosureCallList } from "../../hooks/useClosures.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import styles from "./SpecialDatesTab.module.css";

export interface CallListDialogProps {
  readonly venueId: string;
  readonly ruleId: string;
  readonly onClose: () => void;
}

const PRINTING_ATTRIBUTE = "data-printing-call-list";

/**
 * The call list table. Used twice: in the dialog, and in a print-only copy mounted on `body`.
 * The dialog sits inside the dashboard shell, which a print stylesheet cannot hide without
 * hiding the dialog with it; the copy lets `@media print` drop every other body child.
 */
function CallListTable({ entries }: { readonly entries: readonly ClosureCallListEntry[] }) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  return (
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
  );
}

/**
 * The printable call list (ux.md F5 step 8, F6): name, party, time and phone for guests not yet
 * confirmed delivered or rebooked.
 */
export function CallListDialog({ venueId, ruleId, onClose }: CallListDialogProps) {
  const { t } = useTranslation();
  const list = useClosureCallList({ venueId, ruleId });
  const entries = list.data ?? [];
  const printable = entries.length > 0;

  // While there is a list to print, the print stylesheet shows only the print copy below.
  useEffect(() => {
    if (!printable) return undefined;
    document.body.setAttribute(PRINTING_ATTRIBUTE, "");
    return () => document.body.removeAttribute(PRINTING_ATTRIBUTE);
  }, [printable]);

  return (
    <>
      {printable &&
        createPortal(
          <div data-call-list-print className={styles.printCopy}>
            <h1 className={styles.printTitle}>{t("availabilitySpecial.callList.title")}</h1>
            <CallListTable entries={entries} />
          </div>,
          document.body
        )}
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
            <Button
              variant="primary"
              onClick={() => window.print()}
              disabled={entries.length === 0}
            >
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
          <CallListTable entries={entries} />
        )}
      </Dialog>
    </>
  );
}
