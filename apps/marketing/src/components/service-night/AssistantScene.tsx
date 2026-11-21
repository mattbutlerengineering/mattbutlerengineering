import { useState } from "react";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell";
import { StatusMark } from "./StatusMark";
import styles from "./service-night.module.css";

/**
 * A scripted exchange with the venue assistant. The confirm-then-undo steps
 * mirror what the real assistant does before it changes the book; here they
 * only flip local state.
 */
export function AssistantScene() {
  const [blocked, setBlocked] = useState(false);

  return (
    <SceneShell sceneId="assistant">
      <section className={styles.chat} aria-label="Assistant conversation">
        <Text className={styles.bubbleOperator}>
          Rain is coming. Block the terrace for tonight.
        </Text>
        <div className={styles.bubbleAssistant} aria-live="polite">
          {blocked ? (
            <>
              <Text>Done. The terrace is blocked until close, and new bookings go indoors.</Text>
              <Button variant="ghost" size="sm" onClick={() => setBlocked(false)}>
                Undo
              </Button>
            </>
          ) : (
            <>
              <Text>
                I will block Terrace 1 to 4 from 20:15 until close. No bookings are affected. Go
                ahead?
              </Text>
              <Button variant="primary" size="sm" onClick={() => setBlocked(true)}>
                Confirm
              </Button>
            </>
          )}
        </div>
        <div className={styles.bubbleConcept}>
          <StatusMark status="concept" />
          <Text color="secondary">
            Rain is forecast tomorrow too. Shall I move tomorrow&apos;s terrace bookings indoors and
            text those guests?
          </Text>
        </div>
        <Text variant="detail" color="tertiary">
          This is a demo. Nothing here changes a real venue.
        </Text>
      </section>
    </SceneShell>
  );
}
