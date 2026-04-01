import { Link } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Card, Text, Stack, Stat, Button, EmptyState } from "@mbe/rialto";
import { PageHeader } from "../components/PageHeader";
import styles from "./HomePage.module.css";

const QUICK_ACTIONS = [
  { label: "New Reservation", to: "/timeline" },
  { label: "View Floor Plans", to: "/floor-plans" },
  { label: "Guest Directory", to: "/guests" },
  { label: "Booking Widget", to: "/booking-widget" },
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.name ? `, ${user.name}` : ""}`}
      />

      {/* Stats row */}
      <div className={styles.statsRow}>
        <Card>
          <Stat label="Today's Reservations" value="—" size="lg" />
        </Card>
        <Card>
          <Stat label="Total Covers" value="—" size="lg" />
        </Card>
        <Card>
          <Stat label="Active Tables" value="—" size="lg" />
        </Card>
        <Card>
          <Stat label="Walk-ins Today" value="—" size="lg" />
        </Card>
      </div>

      {/* Quick actions + recent activity */}
      <div className={styles.grid}>
        <Card title="Quick Actions">
          <Stack gap="sm">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.to} to={action.to} className={styles.actionLink}>
                <Button variant="secondary" size="sm" className={styles.actionButton}>
                  {action.label}
                </Button>
              </Link>
            ))}
          </Stack>
        </Card>

        <Card title="Recent Activity">
          <EmptyState
            title="No activity yet"
            description="Reservations, walk-ins, and guest interactions will appear here."
          />
        </Card>

        <Card title="Getting Started">
          <Stack gap="sm">
            <Text variant="body" color="secondary">
              Set up your venue to start accepting reservations.
            </Text>
            <Link to="/onboarding" className={styles.actionLink}>
              <Button variant="primary" size="sm">
                Start Venue Setup
              </Button>
            </Link>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
