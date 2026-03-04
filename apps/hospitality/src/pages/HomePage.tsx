import { useAuth } from "@mbe/auth/react";
import { Card, Text, Stack } from "@mbe/rialto";
import { PageHeader } from "../components/PageHeader";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.name ? `, ${user.name}` : ""}`}
      />

      <div className={styles.grid}>
        <Card title="Quick Stats">
          <Stack gap="xs">
            <Text as="p" variant="display" color="primary">
              0
            </Text>
            <Text variant="caption" color="secondary">
              Active projects
            </Text>
          </Stack>
        </Card>

        <Card title="Recent Activity">
          <Text variant="body" color="secondary">
            No recent activity
          </Text>
        </Card>

        <Card title="Notifications">
          <Text variant="body" color="secondary">
            No new notifications
          </Text>
        </Card>
      </div>
    </div>
  );
}
