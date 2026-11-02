import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog } from "@mattbutlerengineering/rialto";
import { StrandedBookings } from "./StrandedBookings.js";
import {
  dismissStrandedRevert,
  registerStrandedRevertHost,
  useStrandedRevert,
} from "./stranded-revert.js";

/**
 * Names the bookings a refused Undo or Revert would leave without service, each with a link.
 * The page mounts it once; the list sits outside any `role=alert`, so a long one is not read out.
 */
export function StrandedRevertDialog() {
  const { t } = useTranslation();
  const reservations = useStrandedRevert();
  useEffect(() => registerStrandedRevertHost(), []);

  return (
    <Dialog
      open={reservations.length > 0}
      onClose={dismissStrandedRevert}
      title={t("availability.undo.strandedTitle")}
      description={t("availability.undo.errors.stranded-bookings")}
      footer={
        <Button variant="primary" onClick={dismissStrandedRevert}>
          {t("availability.undo.strandedClose")}
        </Button>
      }
    >
      <StrandedBookings reservations={reservations} />
    </Dialog>
  );
}
