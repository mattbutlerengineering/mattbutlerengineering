import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Heading, Skeleton, Text } from "@mattbutlerengineering/rialto";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import type { SetupAction, SetupGroup } from "./setup-tree.js";
import { SetupNodeRow } from "./SetupNodeRow.js";
import styles from "./VenueSetup.module.css";

export interface SetupGroupSectionProps {
  readonly group: SetupGroup;
  readonly isManager: boolean;
  readonly onAction: (action: SetupAction) => void;
  readonly onRetry: () => void;
}

/** Schedules decide first which dates and times exist, then the floor decides who fits. */
const GROUP_STEP: Readonly<Record<SetupGroup["id"], number>> = { open: 1, sit: 2 };

/**
 * One group of the Availability map ("When you're open", "Where guests sit"). Each loads and fails
 * on its own, so a slow or failed floor plan read does not block the schedules, and the other way
 * round.
 */
export function SetupGroupSection(props: SetupGroupSectionProps) {
  const { group, isManager, onAction, onRetry } = props;
  const { t } = useTranslation();
  const headingId = useId();
  const { load } = group;

  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <div className={styles.groupHeader}>
        {/* The order the groups decide availability in; the list order says it to a screen reader. */}
        <Text as="span" className={styles.groupStep} aria-hidden="true">
          {GROUP_STEP[group.id]}
        </Text>
        <Heading level={2} size={5} id={headingId} className={styles.groupHeading}>
          {t(`setup.hub.groups.${group.id}`)}
        </Heading>
      </div>
      {load.status === "loading" && (
        <div role="status" aria-label={t("setup.hub.loading")} className={styles.skeletons}>
          <Skeleton variant="text" width="100%" height={44} />
          <Skeleton variant="text" width="100%" height={44} />
        </div>
      )}
      {load.status === "error" && (
        <ErrorRetryBanner
          title={t("setup.hub.groupError", { group: t(`setup.hub.groups.${group.id}`) })}
          error={describeApiError(load.error).detail}
          details={describeApiError(load.error).raw}
          onRetry={onRetry}
        />
      )}
      {load.status === "ready" && (
        <ul className={styles.tree}>
          {group.nodes.map((node) => (
            <SetupNodeRow key={node.id} node={node} isManager={isManager} onAction={onAction} />
          ))}
        </ul>
      )}
    </section>
  );
}
