import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell.js";
import { StatusMark } from "./StatusMark.js";
import styles from "./showcase.module.css";

/**
 * A scripted exchange with the venue assistant. The confirm-then-undo steps
 * mirror what the real assistant does before it changes the book; here they
 * only flip local state.
 */
export function AssistantScene() {
  const { t } = useTranslation();
  const [blocked, setBlocked] = useState(false);

  return (
    <SceneShell sceneId="assistant">
      <section className={styles.chat} aria-label={t("showcase.assistant.label")}>
        <Text className={styles.bubbleOperator}>{t("showcase.assistant.operator")}</Text>
        <div className={styles.bubbleAssistant} aria-live="polite">
          {blocked ? (
            <>
              <Text>{t("showcase.assistant.done")}</Text>
              <Button variant="ghost" size="sm" onClick={() => setBlocked(false)}>
                {t("showcase.assistant.undo")}
              </Button>
            </>
          ) : (
            <>
              <Text>{t("showcase.assistant.proposal")}</Text>
              <Button variant="primary" size="sm" onClick={() => setBlocked(true)}>
                {t("showcase.assistant.confirm")}
              </Button>
            </>
          )}
        </div>
        <div className={styles.bubbleConcept}>
          <StatusMark status="concept" />
          <Text color="secondary">{t("showcase.assistant.concept")}</Text>
        </div>
        <Text variant="detail" color="tertiary">
          {t("showcase.assistant.disclaimer")}
        </Text>
      </section>
    </SceneShell>
  );
}
