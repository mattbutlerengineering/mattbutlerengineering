import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton, Text } from "@mattbutlerengineering/rialto";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import type { SetupAction, SetupGroup, SetupNode } from "./setup-tree.js";
import { SetupNodeRow } from "./SetupNodeRow.js";
import styles from "./VenueSetup.module.css";

export interface SetupGroupSectionProps {
  readonly group: SetupGroup;
  readonly isManager: boolean;
  readonly onAction: (action: SetupAction) => void;
  readonly onRetry: () => void;
  readonly renderExtra?: (node: SetupNode) => ReactNode;
}

/**
 * One group of the hub ("When you're open", "Where guests sit"). Each loads and fails on its own,
 * so a slow or failed floor plan read does not block the schedules, and the other way round.
 */
export function SetupGroupSection(props: SetupGroupSectionProps) {
  const { group, isManager, onAction, onRetry, renderExtra } = props;
  const { t } = useTranslation();
  const headingId = useId();
  const { load } = group;

  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <Text
        as="h2"
        variant="label"
        color="secondary"
        id={headingId}
        className={styles.groupHeading}
      >
        {t(`setup.hub.groups.${group.id}`)}
      </Text>
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
            <SetupNodeRow
              key={node.id}
              node={node}
              isManager={isManager}
              onAction={onAction}
              renderExtra={renderExtra}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
