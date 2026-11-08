/* eslint-disable mbe-local/prefer-rialto-components -- the same full-width list row as a service's line (QuickSetupLine.module.css); Rialto Button is not that shape */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import { RegularWeekStrip, type RegularWeekStripProps } from "./RegularWeekStrip.js";
import styles from "./QuickSetupLine.module.css";

/**
 * On a phone the guest preview is one closed row under the services (ux.md F2): the strip is long,
 * and the Manager asks for it. Closed by default; the strip is not mounted until opened.
 */
export function PreviewRow({ draft, local }: RegularWeekStripProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        className={styles.header}
        id={`${id}-row`}
        aria-expanded={open}
        aria-controls={`${id}-strip`}
        aria-describedby={`${id}-hint`}
        aria-label={t("availability.quickSetup.previewTitle")}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={styles.text}>
          <Text variant="body" className={styles.name}>
            {t("availability.quickSetup.previewTitle")}
          </Text>
          <Text id={`${id}-hint`} variant="caption" color="secondary">
            {t("availability.quickSetup.strip.about")}
          </Text>
        </span>
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div id={`${id}-strip`} className={open ? styles.fields : undefined}>
        {open && <RegularWeekStrip draft={draft} local={local} labelledBy={`${id}-row`} />}
      </div>
    </div>
  );
}
