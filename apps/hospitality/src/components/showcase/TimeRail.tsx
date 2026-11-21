import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { Scene } from "./service-night.js";
import styles from "./showcase.module.css";

/**
 * The page clock: a pinned readout of the scene on screen. Decorative, since
 * every scene prints its own time in its heading block.
 */
export function TimeRail({ scene }: { scene: Scene }) {
  const { t } = useTranslation();
  return (
    <div className={styles.railAnchor} aria-hidden="true">
      <div className={styles.rail}>
        <Text as="span" mono className={styles.railTime}>
          {scene.time}
        </Text>
        <Text as="span" className={styles.railName}>
          {t(`showcase.scenes.${scene.id}.name`)}
        </Text>
      </div>
    </div>
  );
}
