import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { SetupAction, SetupNode, SetupNodeKind } from "./setup-tree.js";
import { useSetupNodeText, type SetupNodeText } from "./useSetupNodeText.js";
import styles from "./VenueSetup.module.css";

/** Nodes that start open; sections and tables start collapsed. */
const STARTS_OPEN: ReadonlySet<SetupNodeKind> = new Set([
  "schedules",
  "schedule",
  "specialDates",
  "booking",
  "floorPlan",
]);

export interface SetupNodeRowProps {
  readonly node: SetupNode;
  readonly isManager: boolean;
  readonly onAction: (action: SetupAction) => void;
  /** Extra content under the node's own line (the saved regular-week line on a schedule). */
  readonly renderExtra?: (node: SetupNode) => ReactNode;
  readonly text?: SetupNodeText;
}

/**
 * One node of the hub: its kind word, name, state and actions. A node with children is a
 * disclosure (a button with `aria-expanded`); pressing the name expands it and never navigates.
 */
export function SetupNodeRow(props: SetupNodeRowProps) {
  const { node, isManager, onAction, renderExtra } = props;
  const { t } = useTranslation();
  const own = useSetupNodeText();
  const text = props.text ?? own;
  const [open, setOpen] = useState(STARTS_OPEN.has(node.kind));
  const labelId = useId();
  const listId = useId();
  const caption = text.caption(node);
  const what = text.whatIs(node);
  const unset = node.state.kind === "unset";
  const label = text.label(node);
  const hasChildren = node.children.length > 0;

  return (
    <li className={styles.node} aria-labelledby={labelId}>
      <div className={styles.header}>
        {caption && (
          <Text as="span" variant="caption" color="secondary" className={styles.caption}>
            {caption}
          </Text>
        )}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            id={labelId}
            className={styles.disclosure}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((was) => !was)}
          >
            {label}
          </Button>
        ) : (
          <Text as="span" variant="label" id={labelId} className={styles.name}>
            {label}
          </Text>
        )}
        <Text
          as="span"
          variant="caption"
          color="secondary"
          className={unset ? styles.stateUnset : styles.state}
        >
          {text.state(node)}
        </Text>
        {node.actions.length > 0 && (
          <div className={styles.actions}>
            {node.actions.map((action) => (
              <Button
                key={action.id}
                variant={action.primary ? "primary" : "secondary"}
                size="sm"
                className={styles.action}
                data-primary={action.primary ? "true" : undefined}
                aria-label={text.actionName(action)}
                onClick={() => onAction(action)}
              >
                {text.actionLabel(action, node)}
              </Button>
            ))}
          </div>
        )}
      </div>
      {what && (
        <Text variant="caption" color="secondary">
          {what}
        </Text>
      )}
      {unset && !isManager && (
        <Text variant="caption" color="secondary">
          {t("setup.hub.hostUnset")}
        </Text>
      )}
      {node.id === "floor-plan-empty" && (
        <Text variant="caption" color="secondary">
          {t("setup.hub.floorPlanHint")}
        </Text>
      )}
      {renderExtra?.(node)}
      {hasChildren && open && (
        <ul id={listId} className={styles.children}>
          {node.children.map((child) => (
            <SetupNodeRow
              key={child.id}
              node={child}
              isManager={isManager}
              onAction={onAction}
              renderExtra={renderExtra}
              text={text}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
