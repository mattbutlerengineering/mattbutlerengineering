import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { RailGroup, RailLabel, RailNode } from "./availability-rail.js";
import styles from "./AvailabilityRail.module.css";

interface AvailabilityRailProps {
  readonly groups: readonly RailGroup[];
  readonly selectedId: string | null;
  /** Called on every pick, so the phone's sidebar drawer can close. */
  readonly onPick: () => void;
}

function useLabel(): (label: RailLabel) => string {
  const { t } = useTranslation();
  return (label) => ("key" in label ? t(label.key) : label.text);
}

function RailList({
  nodes,
  selectedId,
  onPick,
  nested = false,
}: {
  readonly nodes: readonly RailNode[];
  readonly selectedId: string | null;
  readonly onPick: () => void;
  readonly nested?: boolean;
}) {
  const labelOf = useLabel();
  return (
    <ul className={nested ? styles.nested : styles.list}>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            to={node.to}
            className={styles.link}
            aria-current={node.id === selectedId ? "page" : undefined}
            onClick={onPick}
          >
            {labelOf(node.label)}
          </Link>
          {node.children && node.children.length > 0 && (
            <RailList nodes={node.children} selectedId={selectedId} onPick={onPick} nested />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Every Availability screen as one tree, nested under the app sidebar's Availability item beside
 * whichever one is open (#9944). Each line is a link, so it opens in a new tab and reads as
 * navigation; records nest under the rule they belong to, so the hierarchy is in the markup, not
 * only the indent. On a phone it comes with the sidebar's drawer, which `onPick` closes.
 */
export function AvailabilityRail({ groups, selectedId, onPick }: AvailabilityRailProps) {
  const { t } = useTranslation();
  const labelOf = useLabel();
  return (
    <nav className={styles.rail} aria-label={t("availabilityHub.rail.label")}>
      {groups
        .filter((g) => g.nodes.length > 0)
        .map((g) => (
          <div key={g.id} className={styles.group}>
            {g.heading && (
              <Text as="p" variant="label" color="secondary" className={styles.heading}>
                {labelOf({ key: g.heading })}
              </Text>
            )}
            <RailList nodes={g.nodes} selectedId={selectedId} onPick={onPick} />
          </div>
        ))}
    </nav>
  );
}

AvailabilityRail.displayName = "AvailabilityRail";
