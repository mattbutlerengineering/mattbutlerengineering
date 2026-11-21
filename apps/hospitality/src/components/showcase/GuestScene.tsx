import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, StatusLED, Text } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

type Arrival = "waiting" | "late" | "arrived";

const HOST_MESSAGE_KEY = {
  waiting: "showcase.guest.waiting",
  late: "showcase.guest.runningLate",
  arrived: "showcase.guest.arrived",
} as const;

// The LED pulse stands in for the chime, which the app plays on arrival only.
const HOST_LED: Record<Arrival, "off" | "success" | "warning"> = {
  waiting: "off",
  late: "warning",
  arrived: "success",
};

export function GuestScene() {
  const { t } = useTranslation();
  const [arrival, setArrival] = useState<Arrival>("waiting");

  return (
    <SceneShell sceneId="guest">
      <div className={styles.guestStage}>
        <div className={styles.phone}>
          <Text variant="detail" color="secondary">
            {t("showcase.guest.reservationLabel")}
          </Text>
          <Text>{t("showcase.guest.reservation")}</Text>
          <Stack direction="row" gap="sm" wrap>
            <Button variant="secondary" size="sm" onClick={() => setArrival("late")}>
              {t("showcase.guest.late")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setArrival("arrived")}>
              {t("showcase.guest.here")}
            </Button>
          </Stack>
        </div>
        <div className={styles.hostStand} role="status" aria-label={t("showcase.guest.hostStand")}>
          <StatusLED variant={HOST_LED[arrival]} size="md" pulse={arrival === "arrived"} />
          <Text>{t(HOST_MESSAGE_KEY[arrival])}</Text>
        </div>
      </div>
    </SceneShell>
  );
}
