import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  AvatarGroup,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  Kbd,
  PageHeader,
  Pagination,
  Progress,
  Select,
  Skeleton,
  Slider,
  Stack,
  Table,
  Tabs,
  Tag,
  Text,
  Timeline,
  Toggle,
  Tooltip,
} from "@mbe/rialto";
import styles from "./Dashboard.module.css";

/* ── Mock data ──────────────────────────────── */

const SPEED_DATA = [
  { id: 1, zone: "Pit Exit", speed: 82, best: 84, delta: -2 },
  { id: 2, zone: "Turn 1 Entry", speed: 264, best: 268, delta: -4 },
  { id: 3, zone: "Turn 1 Apex", speed: 142, best: 139, delta: +3 },
  { id: 4, zone: "Back Straight", speed: 312, best: 315, delta: -3 },
  { id: 5, zone: "Chicane Entry", speed: 198, best: 195, delta: +3 },
  { id: 6, zone: "Chicane Exit", speed: 167, best: 171, delta: -4 },
  { id: 7, zone: "Turn 7 Apex", speed: 108, best: 106, delta: +2 },
  { id: 8, zone: "Main Straight", speed: 328, best: 331, delta: -3 },
];

const ALL_LAP_DATA = [
  {
    id: 1,
    lap: 1,
    time: "1:28.341",
    sector1: "29.112",
    sector2: "36.001",
    sector3: "23.228",
    tires: "Soft",
  },
  {
    id: 2,
    lap: 2,
    time: "1:26.892",
    sector1: "28.741",
    sector2: "35.420",
    sector3: "22.731",
    tires: "Soft",
  },
  {
    id: 3,
    lap: 3,
    time: "1:25.671",
    sector1: "28.510",
    sector2: "34.980",
    sector3: "22.181",
    tires: "Soft",
  },
  {
    id: 4,
    lap: 4,
    time: "1:25.203",
    sector1: "28.401",
    sector2: "34.812",
    sector3: "21.990",
    tires: "Soft",
  },
  {
    id: 5,
    lap: 5,
    time: "1:24.892",
    sector1: "28.312",
    sector2: "34.641",
    sector3: "21.939",
    tires: "Soft",
  },
  {
    id: 6,
    lap: 6,
    time: "1:25.044",
    sector1: "28.380",
    sector2: "34.720",
    sector3: "21.944",
    tires: "Soft",
  },
  {
    id: 7,
    lap: 7,
    time: "1:25.310",
    sector1: "28.490",
    sector2: "34.810",
    sector3: "22.010",
    tires: "Medium",
  },
  {
    id: 8,
    lap: 8,
    time: "1:25.781",
    sector1: "28.620",
    sector2: "35.001",
    sector3: "22.160",
    tires: "Medium",
  },
  {
    id: 9,
    lap: 9,
    time: "1:25.520",
    sector1: "28.550",
    sector2: "34.890",
    sector3: "22.080",
    tires: "Medium",
  },
  {
    id: 10,
    lap: 10,
    time: "1:25.901",
    sector1: "28.710",
    sector2: "35.110",
    sector3: "22.081",
    tires: "Medium",
  },
  {
    id: 11,
    lap: 11,
    time: "1:26.203",
    sector1: "28.840",
    sector2: "35.221",
    sector3: "22.142",
    tires: "Medium",
  },
  {
    id: 12,
    lap: 12,
    time: "1:25.412",
    sector1: "28.510",
    sector2: "34.850",
    sector3: "22.052",
    tires: "Medium",
  },
];

const LAPS_PER_PAGE = 5;

/* ── Component ──────────────────────────────── */

export function Dashboard() {
  /* Interactive state */
  const [drsEnabled, setDrsEnabled] = useState(false);
  const [engineMode, setEngineMode] = useState("mode2");
  const [brakeBias, setBrakeBias] = useState(56);
  const [lapPage, setLapPage] = useState(1);
  const [channels, setChannels] = useState<Set<string>>(new Set(["Track", "Box", "Strategy"]));
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Simulate loading delay
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  /* Derived data */
  const totalLapPages = Math.ceil(ALL_LAP_DATA.length / LAPS_PER_PAGE);
  const pagedLaps = ALL_LAP_DATA.slice((lapPage - 1) * LAPS_PER_PAGE, lapPage * LAPS_PER_PAGE);

  function toggleChannel(ch: string) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  }

  return (
    <div className={styles.page}>
      {/* ── Dark header ─────────────────────── */}
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Telemetry", href: "#" },
          { label: "Dashboard" },
        ]}
        title="Pit Wall"
        meta={
          <Badge variant="success" dot size="sm">
            Live
          </Badge>
        }
        actions={
          <AvatarGroup
            size="sm"
            max={4}
            avatars={[
              { name: "Charles Leclerc", status: "online" },
              { name: "Lewis Hamilton", status: "online" },
              { name: "Race Engineer", status: "online" },
              { name: "Strategist", status: "away" },
              { name: "Team Principal" },
            ]}
          />
        }
      />

      {/* ── Light content area ──────────────── */}
      <main className={styles.content}>
        {/* ── Banner ─────────────────────── */}
        {!bannerDismissed && (
          <Banner
            variant="accent"
            dismissible
            onDismiss={() => setBannerDismissed(true)}
            action={
              <Button variant="secondary" size="sm">
                View Schedule
              </Button>
            }
          >
            Race weekend: Monaco GP — qualifying in 3 hours
          </Banner>
        )}

        {/* ── Row 1: Stat cards ──────────── */}
        {loading ? (
          <div className={styles.statGrid}>
            <Skeleton variant="card" width="100%" height={120} />
            <Skeleton variant="card" width="100%" height={120} />
            <Skeleton variant="card" width="100%" height={120} />
          </div>
        ) : (
          <div className={styles.statGrid}>
            {/* Lap Progress */}
            <Card variant="elevated">
              <Text variant="label">Lap Progress</Text>
              <Progress value={72} showValue />
              <Stack direction="row" gap="xs" align="center">
                <Tooltip content="Current position in stint" placement="bottom">
                  <Text variant="caption" as="span">
                    Lap 12 of 17
                  </Text>
                </Tooltip>
                <Badge variant="accent" size="sm">
                  S2
                </Badge>
              </Stack>
            </Card>

            {/* Best Lap */}
            <Card variant="elevated">
              <Text variant="label">Best Lap</Text>
              <Tooltip content="Set on lap 5, soft compound" placement="bottom">
                <Text variant="display">1:24.892</Text>
              </Tooltip>
              <Stack direction="row" gap="xs" align="center">
                <Badge variant="success" size="sm">
                  -0.342s
                </Badge>
                <Badge variant="neutral" size="sm">
                  Qualifying
                </Badge>
              </Stack>
            </Card>

            {/* Tire Health */}
            <Card variant="elevated">
              <Text variant="label">Tire Health</Text>
              <Stack direction="row" gap="xs" wrap>
                <Tooltip content="Front Left: 98°C" placement="bottom">
                  <Badge variant="success" size="sm">
                    FL 98°
                  </Badge>
                </Tooltip>
                <Tooltip content="Front Right: 101°C" placement="bottom">
                  <Badge variant="success" size="sm">
                    FR 101°
                  </Badge>
                </Tooltip>
                <Tooltip content="Rear Left: 112°C — above optimal" placement="bottom">
                  <Badge variant="error" size="sm">
                    RL 112°
                  </Badge>
                </Tooltip>
                <Tooltip content="Rear Right: 104°C" placement="bottom">
                  <Badge variant="success" size="sm">
                    RR 104°
                  </Badge>
                </Tooltip>
              </Stack>
              <Stack direction="row" gap="xs" align="center">
                <Text variant="detail">Medium compound — 7 laps old</Text>
              </Stack>
            </Card>
          </div>
        )}

        {/* ── Row 2: Main grid ───────────── */}
        {loading ? (
          <div className={styles.mainGrid}>
            <Skeleton variant="card" width="100%" height={400} />
            <Stack gap="md">
              <Skeleton variant="card" width="100%" height={180} />
              <Skeleton variant="card" width="100%" height={100} />
            </Stack>
          </div>
        ) : (
          <div className={styles.mainGrid}>
            {/* Left — Telemetry tabs */}
            <Card variant="elevated">
              <Tabs
                tabs={[
                  {
                    id: "speed",
                    label: "Speed Data",
                    content: (
                      <div className={styles.tabPanel}>
                        <Table
                          columns={[
                            { key: "zone", header: "Zone", sortable: true },
                            {
                              key: "speed",
                              header: "Speed (km/h)",
                              sortable: true,
                              align: "right",
                            },
                            {
                              key: "best",
                              header: "Best",
                              sortable: true,
                              align: "right",
                            },
                            {
                              key: "delta",
                              header: "Delta",
                              sortable: true,
                              align: "right",
                              render: (row) => {
                                const d = row.delta as number;
                                const color =
                                  d > 0
                                    ? "var(--rialto-success)"
                                    : d < 0
                                      ? "var(--rialto-error)"
                                      : "var(--rialto-text-tertiary)";
                                return (
                                  <span style={{ color, fontWeight: 500 }}>
                                    {d > 0 ? "+" : ""}
                                    {d}
                                  </span>
                                );
                              },
                            },
                          ]}
                          data={SPEED_DATA}
                          rowKey={(row) => row.id as number}
                          striped
                        />
                      </div>
                    ),
                  },
                  {
                    id: "laps",
                    label: "Lap Times",
                    content: (
                      <div className={styles.tabPanel}>
                        <Table
                          columns={[
                            {
                              key: "lap",
                              header: "Lap",
                              sortable: true,
                              align: "center",
                              width: "60px",
                            },
                            { key: "time", header: "Time", sortable: true },
                            { key: "sector1", header: "S1", align: "right" },
                            { key: "sector2", header: "S2", align: "right" },
                            { key: "sector3", header: "S3", align: "right" },
                            {
                              key: "tires",
                              header: "Tires",
                              render: (row) => (
                                <Badge
                                  variant={row.tires === "Soft" ? "error" : "neutral"}
                                  size="sm"
                                >
                                  {row.tires as string}
                                </Badge>
                              ),
                            },
                          ]}
                          data={pagedLaps}
                          rowKey={(row) => row.id as number}
                          density="compact"
                        />
                        <div style={{ marginTop: "var(--rialto-space-sm)" }}>
                          <Pagination
                            page={lapPage}
                            totalPages={totalLapPages}
                            onChange={setLapPage}
                          />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "engine",
                    label: "Engine",
                    content: (
                      <Stack gap="lg" style={{ padding: "var(--rialto-space-sm) 0" }}>
                        <Toggle
                          label="DRS Override"
                          checked={drsEnabled}
                          onCheckedChange={setDrsEnabled}
                        />
                        <Select
                          label="Engine Mode"
                          value={engineMode}
                          onChange={setEngineMode}
                          options={[
                            { value: "mode1", label: "Mode 1 — Harvest" },
                            { value: "mode2", label: "Mode 2 — Balanced" },
                            { value: "mode3", label: "Mode 3 — Push" },
                            { value: "mode4", label: "Mode 4 — Overtake" },
                            {
                              value: "mode5",
                              label: "Mode 5 — Qualifying",
                              disabled: true,
                            },
                          ]}
                        />
                        <Slider
                          label="Brake Bias"
                          value={brakeBias}
                          onChange={setBrakeBias}
                          min={50}
                          max={65}
                          step={0.5}
                          showValue
                          formatValue={(v) => `${v}% front`}
                        />
                      </Stack>
                    ),
                  },
                ]}
              />
            </Card>

            {/* Right — Strategy sidebar */}
            <Stack gap="md">
              {/* Upcoming actions */}
              <Card variant="flat" title="Upcoming Actions">
                <Timeline
                  compact
                  events={[
                    {
                      title: "Pit stop — box this lap",
                      timestamp: "L14",
                      status: "active",
                      description: "Medium → Hard, +2.4s estimated",
                    },
                    {
                      title: "DRS enabled",
                      timestamp: "L15",
                      status: "upcoming",
                    },
                    {
                      title: "Fuel mixture adjust",
                      timestamp: "L16",
                      status: "upcoming",
                      description: "Switch to harvest mode",
                    },
                    {
                      title: "Final stint push",
                      timestamp: "L17",
                      status: "upcoming",
                    },
                  ]}
                />
              </Card>

              {/* Active channels */}
              <Card variant="flat" title="Active Channels">
                <Stack direction="row" gap="xs" wrap>
                  {["Track", "Box", "Strategy", "Engineer"].map((ch) => (
                    <Tag
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      selected={channels.has(ch)}
                      variant={channels.has(ch) ? "accent" : "default"}
                    >
                      {ch}
                    </Tag>
                  ))}
                </Stack>
              </Card>

              {/* Quick actions */}
              <Card variant="flat" title="Quick Actions">
                <Stack gap="xs">
                  <Button variant="primary" size="sm">
                    Call to Pit
                  </Button>
                  <Button variant="secondary" size="sm">
                    Send Message
                  </Button>
                  <Button variant="ghost" size="sm">
                    View Replay
                  </Button>
                </Stack>
              </Card>
            </Stack>
          </div>
        )}

        {/* ── Row 3: Alerts ──────────────── */}
        <Stack gap="sm" style={{ marginTop: "var(--rialto-space-md)" }}>
          <Alert variant="info" title="Telemetry sync active">
            1,247 data points received this session. All channels nominal.
          </Alert>
          <Alert variant="warning" title="Rear left tire pressure" dismissible>
            Pressure at 28.1 PSI — above optimal range for current compound. Monitor closely.
          </Alert>
        </Stack>

        <Divider spacing="compact" />
      </main>

      {/* ── Footer ──────────────────────────── */}
      <footer className={styles.footer}>
        <Link to="/" className={styles.footerLink}>
          Back to Design System &rarr;
        </Link>
        <Text variant="caption" color="tertiary" as="span">
          Press <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> for commands
        </Text>
      </footer>
    </div>
  );
}
