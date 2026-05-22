import type { ReactNode } from "react";
import {
  Badge,
  Card,
  EmptyState,
  Skeleton,
  SkeletonGroup,
  Stack,
  Stat,
  Table,
  Text,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout, StatePanel } from "./ExamplePageLayout";
import styles from "./DashboardExamplePage.module.css";

// Keep in sync with component below
const DASHBOARD_EXAMPLE_JSX = `import { Badge, Card, EmptyState, Skeleton, SkeletonGroup, Stack, Stat, Table, Text } from "@mattbutlerengineering/rialto";

// KPI data
const KPI_DATA = [
  { label: "Rooms Occupied", value: "142", delta: "+8", trend: "up" },
  { label: "Avg Daily Rate", value: "$287", delta: "-$12", trend: "down" },
  { label: "RevPAR", value: "$204", delta: "+$6", trend: "up" },
  { label: "Guest Satisfaction", value: "4.7", delta: "+0.2", trend: "up" },
] as const;

// Reservation data
const RESERVATION_DATA = [
  { id: "RES-001", guest: "Elena Marchetti", room: "Suite 402", checkIn: "Mar 23", nights: 3, status: "Checked In" },
  { id: "RES-002", guest: "James Whitfield", room: "Deluxe 218", checkIn: "Mar 24", nights: 2, status: "Confirmed" },
  { id: "RES-003", guest: "Amara Okonkwo", room: "Standard 115", checkIn: "Mar 25", nights: 1, status: "Pending" },
  { id: "RES-004", guest: "Luca Ferreira", room: "Suite 510", checkIn: "Mar 26", nights: 4, status: "Confirmed" },
  { id: "RES-005", guest: "Sophie Laurent", room: "Deluxe 307", checkIn: "Mar 27", nights: 2, status: "Cancelled" },
  { id: "RES-006", guest: "Tariq Al-Rashid", room: "Standard 208", checkIn: "Mar 28", nights: 3, status: "Checked In" },
];

type Reservation = (typeof RESERVATION_DATA)[number];
type ReservationStatus = Reservation["status"];

const STATUS_VARIANT: Record<ReservationStatus, "neutral" | "success" | "warning" | "error"> = {
  "Checked In": "success",
  "Confirmed": "neutral",
  "Pending": "warning",
  "Cancelled": "error",
};

const COLUMNS = [
  { key: "id", header: "Reservation" },
  { key: "guest", header: "Guest" },
  { key: "room", header: "Room" },
  { key: "checkIn", header: "Check-in" },
  { key: "nights", header: "Nights", align: "right" as const },
  {
    key: "status",
    header: "Status",
    render: (row: Reservation) => (
      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
    ),
  },
];

export function DashboardExample() {
  return (
    <Stack gap="xl">
      {/* KPI Metrics */}
      <div>
        <Text variant="label" as="h2">Key Metrics</Text>
        <div className={styles.kpiGrid}>
          {KPI_DATA.map((kpi) => (
            <Stat key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.delta} trend={kpi.trend} />
          ))}
        </div>
      </div>

      {/* Reservation Table — multi-state */}
      <div>
        <Text variant="label" as="h2">Reservations</Text>
        <div className={styles.statePanels}>
          <StatePanel label="Empty state">
            <Card>
              <EmptyState heading="No reservations" description="Reservations will appear here once guests book rooms." />
            </Card>
          </StatePanel>

          <StatePanel label="Loading state">
            <Card>
              <SkeletonGroup>
                <Stack gap="md">
                  <Skeleton variant="text" width="100%" height={48} />
                  <Skeleton variant="text" width="100%" height={48} />
                  <Skeleton variant="text" width="100%" height={48} />
                  <Skeleton variant="text" width="100%" height={48} />
                </Stack>
              </SkeletonGroup>
            </Card>
          </StatePanel>

          <StatePanel label="Populated state">
            <Card>
              <Table columns={COLUMNS} data={RESERVATION_DATA} rowKey={(row) => row.id} striped />
            </Card>
          </StatePanel>
        </div>
      </div>
    </Stack>
  );
}`;

/* ── Data ────────────────────────────────────── */

const KPI_DATA = [
  { label: "Rooms Occupied", value: "142", delta: "+8", trend: "up" as const },
  { label: "Avg Daily Rate", value: "$287", delta: "-$12", trend: "down" as const },
  { label: "RevPAR", value: "$204", delta: "+$6", trend: "up" as const },
  { label: "Guest Satisfaction", value: "4.7", delta: "+0.2", trend: "up" as const },
];

const RESERVATION_DATA = [
  {
    id: "RES-001",
    guest: "Elena Marchetti",
    room: "Suite 402",
    checkIn: "Mar 23",
    nights: 3,
    status: "Checked In" as const,
  },
  {
    id: "RES-002",
    guest: "James Whitfield",
    room: "Deluxe 218",
    checkIn: "Mar 24",
    nights: 2,
    status: "Confirmed" as const,
  },
  {
    id: "RES-003",
    guest: "Amara Okonkwo",
    room: "Standard 115",
    checkIn: "Mar 25",
    nights: 1,
    status: "Pending" as const,
  },
  {
    id: "RES-004",
    guest: "Luca Ferreira",
    room: "Suite 510",
    checkIn: "Mar 26",
    nights: 4,
    status: "Confirmed" as const,
  },
  {
    id: "RES-005",
    guest: "Sophie Laurent",
    room: "Deluxe 307",
    checkIn: "Mar 27",
    nights: 2,
    status: "Cancelled" as const,
  },
  {
    id: "RES-006",
    guest: "Tariq Al-Rashid",
    room: "Standard 208",
    checkIn: "Mar 28",
    nights: 3,
    status: "Checked In" as const,
  },
];

type Reservation = (typeof RESERVATION_DATA)[number];
type ReservationStatus = Reservation["status"];

/* ── Badge variant map ───────────────────────── */

const STATUS_VARIANT: Record<ReservationStatus, "neutral" | "success" | "warning" | "error"> = {
  "Checked In": "success",
  Confirmed: "neutral",
  Pending: "warning",
  Cancelled: "error",
};

/* ── Column definitions ──────────────────────── */

const COLUMNS = [
  { key: "id", header: "Reservation" },
  { key: "guest", header: "Guest" },
  { key: "room", header: "Room" },
  { key: "checkIn", header: "Check-in" },
  { key: "nights", header: "Nights", align: "right" as const },
  {
    key: "status",
    header: "Status",
    render: (row: Reservation) => <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>,
  },
];

/* ── Composition notes ───────────────────────── */

const COMPOSITION_NOTES: ReactNode = (
  <>
    <CompositionNote>
      Stat cards in a CSS grid provide at-a-glance KPI visibility. The grid auto-fits to available
      width so the layout adapts from 1- to 4-column without breakpoint overrides.
    </CompositionNote>
    <CompositionNote>
      Badge inside Table cells provides scannable status at a glance — the color variant
      communicates meaning without requiring users to parse text. Map each status string to a
      semantic variant (success, warning, error, neutral) at definition time, not at render time.
    </CompositionNote>
    <CompositionNote>
      Card wraps each table state panel to create visual grouping. All three states (empty, loading,
      populated) render simultaneously so reviewers can compare layouts without toggling state.
    </CompositionNote>
  </>
);

/* ── Page component ──────────────────────────── */

export function DashboardExamplePage() {
  return (
    <ExamplePageLayout
      name="Dashboard"
      description="Operations dashboard with KPI metrics, reservation tracking, and status management"
      sourceJsx={DASHBOARD_EXAMPLE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="xl">
        {/* Section A — KPI Metrics */}
        <div>
          <Text variant="label" as="h2">
            Key Metrics
          </Text>
          <div className={styles.kpiGrid}>
            {KPI_DATA.map((kpi) => (
              <Stat
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                delta={kpi.delta}
                trend={kpi.trend}
              />
            ))}
          </div>
        </div>

        {/* Section B — Reservation table — multi-state panels */}
        <div>
          <Text variant="label" as="h2">
            Reservations
          </Text>
          <div className={styles.statePanels}>
            <StatePanel label="Empty state">
              <Card>
                <EmptyState
                  heading="No reservations"
                  description="Reservations will appear here once guests book rooms."
                />
              </Card>
            </StatePanel>

            <StatePanel label="Loading state">
              <Card>
                <SkeletonGroup>
                  <Stack gap="md">
                    <Skeleton variant="text" width="100%" height={48} />
                    <Skeleton variant="text" width="100%" height={48} />
                    <Skeleton variant="text" width="100%" height={48} />
                    <Skeleton variant="text" width="100%" height={48} />
                  </Stack>
                </SkeletonGroup>
              </Card>
            </StatePanel>

            <StatePanel label="Populated state">
              <Card>
                <Table<Reservation>
                  columns={COLUMNS}
                  data={RESERVATION_DATA}
                  rowKey={(row) => row.id}
                  striped
                />
              </Card>
            </StatePanel>
          </div>
        </div>
      </Stack>
    </ExamplePageLayout>
  );
}

DashboardExamplePage.displayName = "DashboardExamplePage";
