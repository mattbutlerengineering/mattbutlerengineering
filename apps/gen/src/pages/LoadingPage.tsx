import { Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./LoadingPage.module.css";

export function LoadingPage() {
  return (
    <div className={styles.container}>
      <Stack gap="sm" align="center">
        <Text variant="body" color="secondary">
          Loading...
        </Text>
      </Stack>
    </div>
  );
}
