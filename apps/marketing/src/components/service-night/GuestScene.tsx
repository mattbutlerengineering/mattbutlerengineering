import { useState } from "react";
import { Button, Stack, StatusLED, Text } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell";
import styles from "./service-night.module.css";

type Arrival = "waiting" | "late" | "arrived";

const HOST_MESSAGE: Record<Arrival, string> = {
  waiting: "Waiting for the Ito party",
  arrived: "The Ito party is here",
  late: "The Ito party is running 15 minutes late",
};

// The LED pulse stands in for the chime, which the app plays on arrival only.
const HOST_LED: Record<Arrival, "off" | "success" | "warning"> = {
  waiting: "off",
  arrived: "success",
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
            <Button variant="secondary" size="sm" onClick={() => setArrival("late")}>
              Running 15 min late
            </Button>
            <Button variant="primary" size="sm" onClick={() => setArrival("arrived")}>
              We&apos;re here
            </Button>
          </Stack>
        </div>
        <div className={styles.hostStand} role="status" aria-label="Host stand">
          <StatusLED variant={HOST_LED[arrival]} size="md" pulse={arrival === "arrived"} />
          <Text>{HOST_MESSAGE[arrival]}</Text>
        </div>
      </div>
    </SceneShell>
  );
}
