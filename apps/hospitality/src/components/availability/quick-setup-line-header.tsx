/* eslint-disable mbe-local/prefer-rialto-components -- a full-width list row (name over summary, chevron) with its own CSS module; Rialto Button's centred, pressed-scale control is not that shape */
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import type { QuickSetupDraft, ServiceDraft } from "./quick-setup-draft.js";
import { useQuickSetupLineId, useWeekdayName } from "./quick-setup-field-helpers.js";
import { serviceLineText } from "./quick-setup-line.js";
import { issueMessage, type QuickSetupIssue } from "./quick-setup-validate.js";
import styles from "./QuickSetupLine.module.css";

export interface ServiceLineHeaderProps {
  readonly draft: QuickSetupDraft;
  readonly service: ServiceDraft;
  readonly open: boolean;
  /** The service has a problem, so it stays open: the header shows it and does nothing. */
  readonly problem: QuickSetupIssue | null;
  readonly onToggle: () => void;
}

/**
 * The phone's line for one service (ux.md F2): a full-width button, name over a summary, a chevron
 * while it can be toggled (a service with a problem is pinned open instead). It owns no fields: the form renders the service's controls under it.
 */
export function ServiceLineHeader({
  draft,
  service,
  open,
  problem,
  onToggle,
}: ServiceLineHeaderProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const lineId = useQuickSetupLineId();
  const text = serviceLineText(service, draft, format, t);
  const problemText = problem ? issueMessage(problem, draft, t, (day) => dayName(day)) : null;
  return (
    <button
      type="button"
      id={lineId(service.id, "header")}
      className={styles.header}
      aria-expanded={open}
      aria-controls={lineId(service.id, "fields")}
      onClick={onToggle}
    >
      {/* The visible text is the name; the hidden separators make it read "Lunch, 11:30 AM–3:00 PM · Every day". */}
      <span className={styles.text}>
        <Text as="span" variant="body" className={styles.name}>
          {text.name}
        </Text>
        {text.summary !== "" && (
          <>
            <span className={styles.visuallyHidden}>,</span>{" "}
            <Text as="span" variant="caption" color="secondary">
              {text.summary}
            </Text>
          </>
        )}
        {problemText !== null && (
          <>
            <span className={styles.visuallyHidden}>.</span>{" "}
            <Text as="span" variant="caption" color="error">
              {problemText}
            </Text>
          </>
        )}
      </span>
      {problem === null && (
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
      )}
    </button>
  );
}
