import type { ReactNode } from "react";
import styles from "./VisualTest.module.css";

/**
 * Wraps a single component demo in the Visual Test Harness with a
 * data-testid so Playwright can target it for screenshot regression tests.
 */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.section} data-testid={id}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}
