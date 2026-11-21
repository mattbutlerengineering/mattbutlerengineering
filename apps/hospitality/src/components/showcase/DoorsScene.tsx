import { useTranslation } from "react-i18next";
import { NeonSign } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

/** `lit` is true once the night has reached doors: the tube strikes on. */
export function DoorsScene({ lit }: { lit: boolean }) {
  const { t } = useTranslation();
  return (
    <SceneShell sceneId="doors">
      <NeonSign
        size="lg"
        className={styles.sign}
        shape="swoosh"
        state={lit ? "open" : "closed"}
        aria-label={lit ? t("showcase.doors.open") : t("showcase.doors.closed")}
      />
    </SceneShell>
  );
}
