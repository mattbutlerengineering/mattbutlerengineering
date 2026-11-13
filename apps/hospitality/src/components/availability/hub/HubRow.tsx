import { useId } from "react";
import { Link } from "react-router";
import { Heading, Tag, Text } from "@mattbutlerengineering/rialto";
import { OPENED_FROM_HUB } from "../opened-from-hub.js";
import type { HubRowText } from "./hub-row-text.js";
import styles from "./Hub.module.css";

/** A row's one action: where it goes, the word on it, and its name out of context. */
export interface HubRowAction {
  readonly to: string;
  /** "Edit". */
  readonly label: string;
  /** "Edit Regular hours": the label first, so the spoken name starts with the visible one. */
  readonly name: string;
}

export interface HubRowProps {
  readonly text: HubRowText;
  /** `null` when the viewer has nothing to do on this row. */
  readonly action: HubRowAction | null;
  /** Where a service's line goes; `null` leaves every line plain text (a Host). */
  readonly serviceTo: ((venueServiceId: string) => string) | null;
  /** "decides Dec 24" on the row that decided the checked date, else `null`. */
  readonly marker: string | null;
}

/**
 * One of the hub's five rows (availability-hub ux.md, "Hub"): its title, the lines that say what
 * is set, and at most one action. The date check's marker is text beside the title, so it is read
 * out and does not rest on colour.
 */
export function HubRow({ text, action, serviceTo, marker }: HubRowProps) {
  const titleId = useId();
  // Two lines can read the same, so a line is keyed by its rule, else by its place in the row.
  const lines = text.lines.map((line, index) => ({ line, key: line.ruleId ?? `line-${index}` }));
  return (
    <li className={styles.row} aria-labelledby={titleId} data-testid={`hub-row-${text.row}`}>
      <div className={styles.rowHead}>
        <Heading level={3} size={5} id={titleId}>
          {text.title}
        </Heading>
        {marker && <Tag>{marker}</Tag>}
        {action && (
          <Link
            to={action.to}
            state={OPENED_FROM_HUB}
            aria-label={action.name}
            className={`${styles.link} ${styles.rowAction}`}
          >
            {action.label}
          </Link>
        )}
      </div>
      <ul className={styles.lines}>
        {lines.map(({ line, key }) => (
          <li key={key}>
            {serviceTo && line.venueServiceId ? (
              <Link to={serviceTo(line.venueServiceId)} className={styles.link}>
                {line.text}
              </Link>
            ) : (
              <Text variant="body" color="secondary">
                {line.text}
              </Text>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}
