import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import styles from "./FilledField.module.css";

interface FilledFieldProps {
  /** True while the field is marked as just filled from the chat. */
  filled: boolean;
  /** The field's visible name, for the wrapper's accessible name. */
  label: string;
  children: ReactNode;
}

/**
 * Marks a form field the chat just filled (#9474). The mark is static (a tinted ground and a
 * glow ring, no animation), so it is the same under `prefers-reduced-motion`. The spoken
 * announcement lives once on the page, not per field. While marked, the wrapper can be focused
 * from script (the chat's Review action): that lands on the field without opening its popup,
 * and the next Tab enters the control.
 */
export function FilledField({ filled, label, children }: FilledFieldProps) {
  const { t } = useTranslation();
  return (
    <div
      className={filled ? styles.filled : styles.field}
      data-filled-from-chat={filled || undefined}
      {...(filled
        ? {
            tabIndex: -1,
            role: "group",
            "aria-label": t("onboarding.chat.filledGroup", { field: label }),
          }
        : {})}
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
