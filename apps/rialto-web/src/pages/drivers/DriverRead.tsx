import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDrivers } from "./DriverContext";
import { DriverLayout } from "./DriverLayout";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataList,
  EmptyState,
  Meter,
  Stat,
  Text,
  Timeline,
  Tooltip,
  useToast,
} from "@mbe/rialto";
import styles from "./DriverRead.module.css";

const STATUS_VARIANT = {
  active: "success",
  reserve: "accent",
  retired: "neutral",
} as const;

export function DriverRead() {
  const { id } = useParams<{ id: string }>();
  const { drivers, getDriver, deleteDriver } = useDrivers();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const driver = getDriver(id ?? "");

  // Compute max values for Meter bars across all drivers
  const maxStats = useMemo(() => {
    const pts = Math.max(1, ...drivers.map((d) => d.points));
    const wins = Math.max(1, ...drivers.map((d) => d.wins));
    const podiums = Math.max(1, ...drivers.map((d) => d.podiums));
    return { points: pts, wins, podiums };
  }, [drivers]);

  if (!driver) {
    return (
      <DriverLayout
        title="Driver Not Found"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Drivers", href: "/drivers" },
          { label: "Not Found" },
        ]}
      >
        <EmptyState
          title="Driver not found"
          description="This driver may have been removed or the link is invalid."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/drivers")}>
              View All Drivers
            </Button>
          }
        />
      </DriverLayout>
    );
  }

  function handleDelete() {
    if (!driver) return;
    deleteDriver(driver.id);
    setConfirmDelete(false);
    toast({
      title: `${driver.name} removed`,
      variant: "default",
    });
    navigate("/drivers");
  }

  return (
    <DriverLayout
      title={driver.name}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Drivers", href: "/drivers" },
        { label: driver.name },
      ]}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/drivers/${driver.id}/edit`)}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </>
      }
    >
      {/* ── Profile header ───────────────────── */}
      <div className={styles.profileHeader}>
        <Avatar name={driver.name} size="xl" />
        <div className={styles.profileInfo}>
          <h2 className={styles.profileName}>{driver.name}</h2>
          <div className={styles.profileMeta}>
            <Badge variant={STATUS_VARIANT[driver.status]} size="sm">
              {driver.status.charAt(0).toUpperCase() + driver.status.slice(1)}
            </Badge>
            <Text variant="caption" color="tertiary">
              #{driver.number} &middot; {driver.team}
            </Text>
          </div>
        </div>
        <div className={styles.profileActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/drivers/${driver.id}/edit`)}
          >
            Edit Driver
          </Button>
        </div>
      </div>

      {/* ── Stats with Meter bars ──────────────── */}
      <div className={styles.statsRow}>
        <Card variant="elevated">
          <Stat value={driver.points.toLocaleString()} label="Career Points" size="lg" />
          <Meter
            label="Points"
            value={driver.points}
            max={maxStats.points}
            variant="accent"
            showValue
          />
        </Card>
        <Card variant="elevated">
          <Stat value={driver.wins} label="Race Wins" size="lg" />
          <Meter label="Wins" value={driver.wins} max={maxStats.wins} variant="success" showValue />
        </Card>
        <Card variant="elevated">
          <Stat value={driver.podiums} label="Podiums" size="lg" />
          <Meter
            label="Podiums"
            value={driver.podiums}
            max={maxStats.podiums}
            variant="default"
            showValue
          />
        </Card>
      </div>

      {/* ── Details + Timeline ───────────────── */}
      <div className={styles.detailGrid}>
        <Card variant="flat" title="Profile">
          <DataList
            items={[
              { label: "Full Name", value: driver.name },
              {
                label: "Car Number",
                value: (
                  <Tooltip content="Permanent number for the season" placement="top">
                    <span>#{driver.number}</span>
                  </Tooltip>
                ),
              },
              {
                label: "Team",
                value: (
                  <Tooltip content="Current constructor team" placement="top">
                    <span>{driver.team}</span>
                  </Tooltip>
                ),
              },
              { label: "Nationality", value: driver.nationality },
              {
                label: "Status",
                value: (
                  <Badge variant={STATUS_VARIANT[driver.status]} size="sm">
                    {driver.status.charAt(0).toUpperCase() + driver.status.slice(1)}
                  </Badge>
                ),
              },
            ]}
          />
        </Card>

        <Card variant="flat" title="Career Timeline">
          <Timeline
            compact
            events={[
              {
                title: `Joined ${driver.team}`,
                timestamp: "2024",
                status: "completed",
              },
              {
                title: `${driver.wins} race wins`,
                timestamp: "2024",
                status: driver.wins > 0 ? "completed" : "upcoming",
              },
              {
                title: `${driver.podiums} podium finishes`,
                timestamp: "2025",
                status: driver.podiums > 0 ? "completed" : "upcoming",
              },
              {
                title: "Current season",
                timestamp: "2026",
                status: driver.status === "active" ? "active" : "upcoming",
                description:
                  driver.status === "active"
                    ? `Racing for ${driver.team}`
                    : driver.status === "retired"
                      ? "Retired from active racing"
                      : `Reserve driver for ${driver.team}`,
              },
            ]}
          />
        </Card>
      </div>

      {/* ── Delete confirmation ──────────────── */}
      <ConfirmDialog
        open={confirmDelete}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        title={`Remove ${driver.name}?`}
        description="This action can be undone."
        confirmLabel="Remove"
        variant="destructive"
      />
    </DriverLayout>
  );
}
