import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Popover, Text } from "@mattbutlerengineering/rialto";
import { useAuth } from "@mbe/auth/react";
import type { SystemHealth } from "@mbe/api-client";
import { useApiClient } from "../hooks/useApiClient.js";
import styles from "./SystemHealthBadge.module.css";

const POLL_INTERVAL_MS = 60_000;

function statusColor(status: string): "green" | "yellow" | "red" | "neutral" {
  switch (status) {
    case "healthy":
    case "ok":
      return "green";
    case "degraded":
      return "yellow";
    case "unhealthy":
    case "error":
      return "red";
    default:
      return "neutral";
  }
}

function StatusDot({ status }: { readonly status: string }) {
  const colorMap: Record<string, string> = {
    healthy: "var(--rialto-color-green-500, #22c55e)",
    ok: "var(--rialto-color-green-500, #22c55e)",
    degraded: "var(--rialto-color-yellow-500, #eab308)",
    unhealthy: "var(--rialto-color-red-500, #ef4444)",
    error: "var(--rialto-color-red-500, #ef4444)",
  };
  const color = colorMap[status] ?? "var(--rialto-text-tertiary)";

  return (
    <Text
      className={styles.dot}
      style={{ backgroundColor: color }}
      aria-label={`System ${status}`}
    />
  );
}

export function SystemHealthBadge() {
  const { user } = useAuth();
  const api = useApiClient();
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Only show to admin users — permissions live in the raw JWT claims
  const rawPermissions = user?.raw?.permissions;
  const isAdmin = Array.isArray(rawPermissions) && rawPermissions.includes("admin");

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.health.getSystemHealth();
      setHealth(data);
    } catch {
      // Silent failure — badge just shows stale data
    }
  }, [api]);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHealth();
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAdmin, fetchHealth]);

  if (!isAdmin || !health) return null;

  const trigger = (
    <Button type="button" className={styles.trigger} aria-label={`System health: ${health.status}`}>
      <StatusDot status={health.status} />
    </Button>
  );

  return (
    <Popover trigger={trigger} placement="bottom">
      <div className={styles.panel}>
        <div className={styles.header}>
          <Text className={styles.title}>System Health</Text>
          <Badge color={statusColor(health.status)} size="sm">
            {health.status}
          </Badge>
        </div>

        {health.services && (
          <div className={styles.section}>
            <Text className={styles.sectionLabel}>Services</Text>
            {Object.entries(health.services).map(([name, svc]) => (
              <div key={name} className={styles.row}>
                <StatusDot status={svc.status} />
                <Text className={styles.name}>{name}</Text>
                {svc.latency != null && <Text className={styles.meta}>{svc.latency}ms</Text>}
              </div>
            ))}
          </div>
        )}

        {health.ci && (
          <div className={styles.row}>
            <StatusDot status={health.ci.status} />
            <Text className={styles.name}>CI</Text>
          </div>
        )}

        {health.deploy && (
          <div className={styles.row}>
            <StatusDot status={health.deploy.status} />
            <Text className={styles.name}>Deploys</Text>
          </div>
        )}

        <div className={styles.footer}>
          <Text className={styles.meta}>
            Updated {new Date(health.timestamp).toLocaleTimeString()}
          </Text>
        </div>
      </div>
    </Popover>
  );
}
