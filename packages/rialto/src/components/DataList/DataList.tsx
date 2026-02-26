import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./DataList.module.css";

/**
 * A single key-value entry rendered inside a `DataList`.
 *
 * @example
 * const item: DataListItem = { label: "Team", value: "Red Bull Racing" };
 */
export interface DataListItem {
  label: string;
  value: ReactNode;
}

/**
 * A definition list of key-value pairs laid out horizontally or vertically.
 * Use for spec sheets, metadata panels, or any structured label-value display.
 *
 * @example
 * <DataList
 *   items={[
 *     { label: "Team", value: "Red Bull Racing" },
 *     { label: "Engine", value: "Honda RBPT" },
 *   ]}
 *   orientation="horizontal"
 *   striped
 * />
 */
export interface DataListProps extends HTMLAttributes<HTMLDListElement> {
  items: DataListItem[];
  /** Layout direction for label/value pairs */
  orientation?: "vertical" | "horizontal";
  /** Alternate row backgrounds */
  striped?: boolean;
}

export const DataList = forwardRef<HTMLDListElement, DataListProps>(
  ({ items, orientation = "horizontal", striped = false, className, ...props }, ref) => {
    const classes = [
      styles.list,
      orientation === "vertical" ? styles.vertical : styles.horizontal,
      striped ? styles.striped : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <dl ref={ref} className={classes} {...props}>
        {items.map((item, i) => (
          <div key={i} className={styles.row}>
            <dt className={styles.label}>{item.label}</dt>
            <dd className={styles.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
);

DataList.displayName = "DataList";
