import { useState, useEffect, useCallback } from "react";
import { Card, Badge, Spinner, Heading, Text } from "@mattbutlerengineering/rialto";
import styles from "./StatusPage.module.css";

interface ServiceStatus {
  readonly name: string;
  readonly url: string;
  readonly status: "ok" | "degraded" | "error" | "loading";
  readonly version?: string;
  readonly latency?: number;
  readonly checkedAt?: string;
}

const SERVICES = [
  { name: "Users API", url: "/api/v1/users/health" },
  { name: "Reservations API", url: "/api/v1/reservations/health" },
  { name: "Agent API", url: "/api/gen/health" },
] as const;

const STATIC_SITES = [
  { name: "Marketing", url: "/" },
  { name: "Hospitality", url: "/hospitality/" },
  { name: "Rialto", url: "/rialto/" },
] as const;

const POLL_INTERVAL_MS = 30_000;

function statusColor(status: string): "green" | "yellow" | "red" | "neutral" {
  switch (status) {
    case "ok":
      return "green";
    case "degraded":
      return "yellow";
    case "error":
      return "red";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "error":
      return "Down";
    case "loading":
      return "Checking...";
    default:
      return "Unknown";
  }
}

async function checkService(url: string): Promise<Omit<ServiceStatus, "name" | "url">> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    const latency = Date.now() - start;
    if (!response.ok) {
      return { status: "error", latency, checkedAt: new Date().toISOString() };
    }
    const data = await response.json();
    return {
      status: data.status === "ok" ? "ok" : "degraded",
      version: data.version,
      latency,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "error",
      latency: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }
}

async function checkStaticSite(url: string): Promise<Omit<ServiceStatus, "name" | "url">> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    const latency = Date.now() - start;
    return {
      status: response.ok ? "ok" : "error",
      latency,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "error",
      latency: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }
}

function overallStatus(statuses: ServiceStatus[]): "ok" | "degraded" | "error" | "loading" {
  if (statuses.some((s) => s.status === "loading")) return "loading";
  if (statuses.every((s) => s.status === "ok")) return "ok";
  if (statuses.some((s) => s.status === "error")) return "error";
  return "degraded";
}

export function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({ ...s, status: "loading" as const }))
  );
  const [sites, setSites] = useState<ServiceStatus[]>(
    STATIC_SITES.map((s) => ({ ...s, status: "loading" as const }))
  );
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const serviceResults = await Promise.all(
      SERVICES.map(async (s) => ({
        ...s,
        ...(await checkService(s.url)),
      }))
    );
    setServices(serviceResults);

    const siteResults = await Promise.all(
      STATIC_SITES.map(async (s) => ({
        ...s,
        ...(await checkStaticSite(s.url)),
      }))
    );
    setSites(siteResults);
    setLastRefresh(new Date().toISOString());
  }, []);

  useEffect(() => {
    // Initial fetch on mount — intentionally calls setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const allStatuses = [...services, ...sites];
  const overall = overallStatus(allStatuses);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>System Status</Heading>
        <div className={styles.overallStatus}>
          <Badge color={statusColor(overall)} size="md">
            {overall === "loading" ? "Checking..." : statusLabel(overall)}
          </Badge>
        </div>
        {lastRefresh && (
          <Text className={styles.lastChecked}>
            Last checked: {new Date(lastRefresh).toLocaleTimeString()}
            {" · "}Refreshes every 30s
          </Text>
        )}
      </header>

      <section className={styles.section}>
        <Heading level={2}>API Services</Heading>
        <div className={styles.serviceGrid}>
          {services.map((service) => (
            <Card key={service.name} className={styles.card}>
              <div className={styles.cardHeader}>
                <Text className={styles.serviceName}>{service.name}</Text>
                {service.status === "loading" ? (
                  <Spinner size="sm" />
                ) : (
                  <Badge color={statusColor(service.status)}>
                    {statusLabel(service.status)}
                  </Badge>
                )}
              </div>
              {service.latency !== undefined && (
                <Text className={styles.meta}>
                  Latency: {service.latency}ms
                  {service.version && ` · v${service.version}`}
                </Text>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Static Sites</Heading>
        <div className={styles.serviceGrid}>
          {sites.map((site) => (
            <Card key={site.name} className={styles.card}>
              <div className={styles.cardHeader}>
                <Text className={styles.serviceName}>{site.name}</Text>
                {site.status === "loading" ? (
                  <Spinner size="sm" />
                ) : (
                  <Badge color={statusColor(site.status)}>
                    {statusLabel(site.status)}
                  </Badge>
                )}
              </div>
              {site.latency !== undefined && (
                <Text className={styles.meta}>Latency: {site.latency}ms</Text>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
