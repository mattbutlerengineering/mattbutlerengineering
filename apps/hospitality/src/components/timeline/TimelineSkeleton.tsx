import { Skeleton, Text } from "@mattbutlerengineering/rialto";
import styles from "./TimelineSkeleton.module.css";

const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 60;
const ROW_COUNT = 5;

/**
 * The grid's loading state (ux.md Screen 7): one busy status region holding a header row and five
 * table rows. The text is content, not a label, so it is announced once — and it never carries a
 * count, because there is nothing to count yet (A9.1).
 */
export function TimelineSkeleton() {
  return (
    <div role="status" aria-busy="true" data-testid="timeline-skeleton" className={styles.root}>
      <Text as="span" className={styles.visuallyHidden}>
        Loading tonight&apos;s grid…
      </Text>
      <Skeleton variant="rect" height={HEADER_HEIGHT} />
      {Array.from({ length: ROW_COUNT }, (_, row) => (
        <Skeleton key={row} variant="rect" height={ROW_HEIGHT} />
      ))}
    </div>
  );
}
