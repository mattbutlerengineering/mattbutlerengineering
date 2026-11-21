import { Odometer, Text, useScrollReveal } from "@mattbutlerengineering/rialto";
import { NIGHT_TOTALS } from "../../data/service-night";
import { SceneShell } from "./SceneShell";
import styles from "./service-night.module.css";

export function CloseScene() {
  // `revealed` gates the count-up, so the reels roll once the totals are on screen.
  const { ref, revealed } = useScrollReveal();

  return (
    <SceneShell sceneId="close">
      <div ref={ref} className={styles.totals}>
        {NIGHT_TOTALS.map((total) => (
          <div key={total.id} className={styles.total}>
            <Odometer
              value={revealed ? total.value : 0}
              size="md"
              aria-label={total.label}
              // Pinned to the final digit count, so the count-up never changes the layout.
              formatOptions={{ minimumIntegerDigits: String(total.value).length }}
            />
            <Text variant="detail" color="secondary">
              {total.label}
            </Text>
          </div>
        ))}
      </div>
    </SceneShell>
  );
}
