import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import { NIGHT_TOTALS } from "./service-night.js";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

export function CloseScene() {
  const { t } = useTranslation();

  return (
    <SceneShell sceneId="close">
      <div className={styles.totals}>
        {NIGHT_TOTALS.map((total) => (
          <div key={total.id} className={styles.total}>
            <Text variant="display">{total.value}</Text>
            <Text variant="detail" color="secondary">
              {t(`showcase.close.${total.id}`)}
            </Text>
          </div>
        ))}
      </div>
    </SceneShell>
  );
}
