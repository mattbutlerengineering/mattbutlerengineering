import type { ReactNode } from "react";
import { Text, Stack } from "@mattbutlerengineering/rialto";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Inline-end content on the title row; wraps beneath the title below 768px. */
  aside?: ReactNode;
}

export function PageHeader({ title, description, aside }: PageHeaderProps) {
  const className = aside ? `${styles.header} ${styles.withAside}` : styles.header;
  return (
    <div className={className}>
      <Stack gap="xs">
        {/* tabIndex={-1}: useFocusAfter's pageHeading target lands here after a load or Retry. */}
        <Text as="h1" variant="display" color="primary" tabIndex={-1}>
          {title}
        </Text>
        {description && (
          <Text variant="caption" color="secondary">
            {description}
          </Text>
        )}
      </Stack>
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}
