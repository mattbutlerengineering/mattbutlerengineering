import styles from "./draft-wait.module.css";

/**
 * Keeps the drawer's focus trap from choosing this control as the first thing to focus: a day's
 * own editor is where a Manager starts, not the Remove or Edit beside a layer above it.
 */
export const skipInitialFocus = { "data-focus-trap-skip-initial": "true" } as const;

/**
 * Props for a button that must wait for an open editor. `aria-disabled` rather than `disabled`,
 * so Tab still reaches it and a screen reader reads the reason it is described by.
 */
export function waitingProps(waiting: boolean, reasonId: string | undefined) {
  return waiting
    ? { "aria-disabled": true, "aria-describedby": reasonId, className: styles.waiting }
    : {};
}
