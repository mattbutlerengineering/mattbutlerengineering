import { Text } from "@mattbutlerengineering/rialto";
import type { StatusMessage } from "../hooks/useStatusMessage.js";
import styles from "./LiveStatus.module.css";

interface LiveStatusProps {
  readonly status: StatusMessage | null;
}

/**
 * The page's single live region. Mount it from the first render (empty) so assistive tech is
 * already watching when the first sentence arrives; the `key={seq}` span remounts on every
 * announcement, so an identical sentence is announced again.
 */
export function LiveStatus({ status }: LiveStatusProps) {
  return (
    <div role="status" aria-live="polite" className={styles.visuallyHidden}>
      {status && (
        <Text key={status.seq} as="span">
          {status.text}
        </Text>
      )}
    </div>
  );
}
