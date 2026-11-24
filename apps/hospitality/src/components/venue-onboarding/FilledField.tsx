import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import styles from "./FilledField.module.css";

interface FilledFieldProps {
  /** True while the field is marked as just filled from the chat. */
  filled: boolean;
  children: ReactNode;
}

/**
 * Marks a form field the chat just filled (#9474). The mark is static (a tinted ground and a
 * glow ring, no animation), so it is the same under `prefers-reduced-motion`. The spoken
 * announcement lives once on the page, not per field.
 */
export function FilledField({ filled, children }: FilledFieldProps) {
  const { t } = useTranslation();
  return (
    <div
      className={filled ? styles.filled : styles.field}
      data-filled-from-chat={filled || undefined}
    >
      {children}
      {filled && (
        <Text variant="caption" color="secondary" className={styles.tag}>
          {t("onboarding.chat.filledTag")}
        </Text>
      )}
    </div>
  );
}
