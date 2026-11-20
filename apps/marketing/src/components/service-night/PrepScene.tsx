import { DepartureBoard } from "@mattbutlerengineering/rialto";
import { BRIEFING_LINES, BRIEFING_LINE_MAX } from "../../data/service-night";
import { SceneShell } from "./SceneShell";
import styles from "./service-night.module.css";

export function PrepScene() {
  return (
    <SceneShell sceneId="prep">
      <div className={styles.board}>
        <DepartureBoard phrases={[...BRIEFING_LINES]} length={BRIEFING_LINE_MAX} size="md" />
      </div>
    </SceneShell>
  );
}
