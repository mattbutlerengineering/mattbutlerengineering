import { useState, useEffect, useCallback } from "react";
import { Badge, Popover } from "@mbe/rialto";
import { useAuth } from "@mbe/auth/react";
import styles from "./SystemHealthBadge.module.css";

interface ServiceHealth {
  readonly status: string;
  readonly version?: string;
  readonly latency?: number;
}

interface SystemHealth {
  readonly status: string;
  readonly timestamp: string;
  readonly services?: Record<string, ServiceHealth>;
  readonly staticSites?: Record<string, { status: string }>;
  readonly ci?: { status: string };
  readonly deploy?: { status: string };
}

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
    <span
      className={styles.dot}
      style={{ backgroundColor: color }}
      aria-label={`System ${status}`}
    />
  );
}

export function SystemHealthBadge() {
  const { user } = useAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Only show to admin users — permissions live in the raw JWT claims
  const rawPermissions = user?.raw?.permissions;
  const isAdmin =
    Array.isArray(rawPermissions) && rawPermissions.includes("admin");

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health/system", {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        setHealth(await response.json());
      }
    } catch {
      // Silent failure — badge just shows stale data
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHealth();
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAdmin, fetchHealth]);

  if (!isAdmin || !health) return null;

  const trigger = (
    <button
      type="button"
      className={styles.trigger}
      aria-label={`System health: ${health.status}`}
    >
      <StatusDot status={health.status} />
    </button>
  );

  return (
    <Popover trigger={trigger} placement="bottom">
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>System Health</span>
          <Badge color={statusColor(health.status)} size="sm">
            {health.status}
          </Badge>
        </div>

        {health.services && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Services</span>
            {Object.entries(health.services).map(([name, svc]) => (
              <div key={name} className={styles.row}>
                <StatusDot status={svc.status} />
                <span className={styles.name}>{name}</span>
                {svc.latency != null && (
                  <span className={styles.meta}>{svc.latency}ms</span>
                )}
              </div>
            ))}
          </div>
        )}

        {health.ci && (
          <div className={styles.row}>
            <StatusDot status={health.ci.status} />
            <span className={styles.name}>CI</span>
          </div>
        )}

        {health.deploy && (
          <div className={styles.row}>
            <StatusDot status={health.deploy.status} />
            <span className={styles.name}>Deploys</span>
          </div>
        )}

        <div className={styles.footer}>
          <span className={styles.meta}>
            Updated {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </Popover>
  );
}
