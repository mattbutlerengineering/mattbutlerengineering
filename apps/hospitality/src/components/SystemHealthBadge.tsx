import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Badge, Button, Popover, Text } from "@mattbutlerengineering/rialto";
import { useIsAdmin } from "../hooks/useIsAdmin.js";
import type { SystemHealth } from "@mbe/api-client";
import { useApiClient } from "../hooks/useApiClient.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
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

function statusText(t: TFunction, status: string): string {
  switch (status) {
    case "healthy":
      return t("health.status.healthy");
    case "ok":
      return t("health.status.ok");
    case "degraded":
      return t("health.status.degraded");
    case "unhealthy":
      return t("health.status.unhealthy");
    case "error":
      return t("health.status.error");
    default:
      return status;
  }
}

function StatusDot({ status }: { readonly status: string }) {
  const { t } = useTranslation();
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
      aria-label={t("health.dotLabel", { status: statusText(t, status) })}
    />
  );
}

export function SystemHealthBadge() {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const api = useApiClient();
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Only show to admin users — permissions live in the raw JWT claims (#3069).
  const isAdmin = useIsAdmin();

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.health.system();
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
    <Button
      type="button"
      className={styles.trigger}
      aria-label={t("health.triggerLabel", { status: statusText(t, health.status) })}
    >
      <StatusDot status={health.status} />
    </Button>
  );

  return (
    <Popover trigger={trigger} placement="bottom">
      <div className={styles.panel}>
        <div className={styles.header}>
          <Text className={styles.title}>{t("health.title")}</Text>
          <Badge color={statusColor(health.status)} size="sm">
            {statusText(t, health.status)}
          </Badge>
        </div>

        <div className={styles.section}>
          <div className={styles.row}>
            <StatusDot status={health.subsystems.services.status} />
            <Text className={styles.sectionLabel}>{t("health.services")}</Text>
          </div>
          {health.subsystems.services.checks &&
            Object.entries(health.subsystems.services.checks).map(([name, svc]) => (
              <div key={name} className={styles.row}>
                <StatusDot status={svc.status} />
                <Text className={styles.name}>{name}</Text>
                {svc.latency != null && (
                  <Text className={styles.meta}>{t("health.latency", { ms: svc.latency })}</Text>
                )}
              </div>
            ))}
        </div>

        <div className={styles.row}>
          <StatusDot status={health.subsystems.ci.status} />
          <Text className={styles.name}>{t("health.ci")}</Text>
        </div>

        <div className={styles.row}>
          <StatusDot status={health.subsystems.deploys.status} />
          <Text className={styles.name}>{t("health.deploys")}</Text>
        </div>

        <div className={styles.footer}>
          <Text className={styles.meta}>
            {t("health.updated", {
              time: fmt.formatInstant(health.timestamp, {
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
              }),
            })}
          </Text>
        </div>
      </div>
    </Popover>
  );
}
