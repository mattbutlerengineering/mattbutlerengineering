import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DepartureBoard } from "@mattbutlerengineering/rialto";
import { BRIEFING_LINE_IDS, BRIEFING_LINE_MAX } from "./service-night.js";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

export function PrepScene() {
  const { t } = useTranslation();
  // Stable identity per language, so a re-render does not restart the board's cycle.
  const phrases = useMemo(() => BRIEFING_LINE_IDS.map((id) => t(`showcase.prep.board.${id}`)), [t]);

  return (
    <SceneShell sceneId="prep">
      <div className={styles.board}>
        {/* The board's charset is unaccented capitals; the label carries the full sentence. */}
        <DepartureBoard
          phrases={phrases}
          length={BRIEFING_LINE_MAX}
          size="md"
          role="img"
          aria-label={t("showcase.prep.boardLabel")}
        />
      </div>
    </SceneShell>
  );
}
