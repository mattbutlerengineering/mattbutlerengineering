import { Text } from "@mattbutlerengineering/rialto";
import type { Scene } from "../../data/service-night";
import styles from "./service-night.module.css";

/**
 * The page clock: a pinned readout of the scene on screen. Decorative, since
 * every scene prints its own time in its heading block.
 */
export function TimeRail({ scene }: { scene: Scene }) {
  return (
    <div className={styles.railAnchor} aria-hidden="true">
      <div className={styles.rail}>
        <Text as="span" mono className={styles.railTime}>
          {scene.time}
        </Text>
        <Text as="span" className={styles.railName}>
          {scene.name}
        </Text>
      </div>
    </div>
  );
}
