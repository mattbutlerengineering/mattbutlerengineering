import styles from "./draft-wait.module.css";

/**
 * Props for a button that must wait for an open editor. `aria-disabled` rather than `disabled`,
 * so Tab still reaches it and a screen reader reads the reason it is described by.
 */
export function waitingProps(waiting: boolean, reasonId: string | undefined) {
  return waiting
    ? { "aria-disabled": true, "aria-describedby": reasonId, className: styles.waiting }
    : {};
}
