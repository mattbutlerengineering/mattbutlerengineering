import { Text, Stack } from "@mattbutlerengineering/rialto";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className={styles.header}>
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
    </div>
  );
}
