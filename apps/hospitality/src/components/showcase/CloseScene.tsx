import { useTranslation } from "react-i18next";
import { Odometer, Text, useScrollReveal } from "@mattbutlerengineering/rialto";
import { NIGHT_TOTALS } from "./service-night.js";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

export function CloseScene() {
  const { t } = useTranslation();
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
              aria-label={t(`showcase.close.${total.id}`)}
              // Pinned to the final digit count, so the count-up never changes the layout.
              formatOptions={{ minimumIntegerDigits: String(total.value).length }}
            />
            <Text variant="detail" color="secondary">
              {t(`showcase.close.${total.id}`)}
            </Text>
          </div>
        ))}
      </div>
    </SceneShell>
  );
}
