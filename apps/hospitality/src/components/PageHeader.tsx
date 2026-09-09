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
        <Text as="h1" variant="display" color="primary">
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
