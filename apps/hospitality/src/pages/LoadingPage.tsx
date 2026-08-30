import { Stack, Text, WatchLoader } from "@mattbutlerengineering/rialto";
import styles from "./LoadingPage.module.css";

/**
 * Route-level loading state — a mechanical watch movement in place of bare
 * text, per the rialto "precision in motion" voice. WatchLoader handles
 * prefers-reduced-motion internally.
 */
export function LoadingPage() {
  return (
    <div className={styles.container}>
      <Stack gap="sm" align="center">
        <WatchLoader aria-label="Loading" size="md" />
        <Text variant="caption" color="tertiary">
          Winding things up
        </Text>
      </Stack>
    </div>
  );
}
