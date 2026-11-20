import { useState } from "react";
import { Button, Stack, StatusLED, Text } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell";
import styles from "./service-night.module.css";

type Arrival = "waiting" | "coming" | "late";

const HOST_MESSAGE: Record<Arrival, string> = {
  waiting: "Waiting for the Ito party",
  coming: "The Ito party is on the way",
  late: "The Ito party is running late",
};

const HOST_LED: Record<Arrival, "off" | "success" | "warning"> = {
  waiting: "off",
  coming: "success",
  late: "warning",
};

export function GuestScene() {
  const [arrival, setArrival] = useState<Arrival>("waiting");

  return (
    <SceneShell sceneId="guest">
      <div className={styles.guestStage}>
        <div className={styles.phone}>
          <Text variant="detail" color="secondary">
            Your reservation
          </Text>
          <Text>Table for 4 tonight at 8:45 PM</Text>
          <Stack direction="row" gap="sm" wrap>
            <Button variant="primary" size="sm" onClick={() => setArrival("coming")}>
              On my way
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setArrival("late")}>
              Running late
            </Button>
          </Stack>
        </div>
        <div className={styles.hostStand} role="status" aria-label="Host stand">
          <StatusLED variant={HOST_LED[arrival]} size="md" pulse={arrival !== "waiting"} />
          <Text>{HOST_MESSAGE[arrival]}</Text>
        </div>
      </div>
    </SceneShell>
  );
}
