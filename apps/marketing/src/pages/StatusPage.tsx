import { useState, useEffect, useCallback } from "react";
import { Card, Badge, Spinner, Heading, Text } from "@mattbutlerengineering/rialto";
import { statusColor, statusLabel, overallStatus } from "../utils/formatters.js";
import type { ServiceStatus } from "../utils/formatters.js";
import {
  STATUS_SERVICES as SERVICES,
  STATUS_SITES as STATIC_SITES,
  STATUS_SENSOR_REPORT_URL,
} from "../data/status-probes.js";
import { describeSensorGap } from "../data/ai-health.js";
import styles from "./StatusPage.module.css";

/** Row name for the e2eStability signal pulled from the sensor report (#9016). */
const E2E_SENSOR_NAME = "E2E Tests (main)";

const POLL_INTERVAL_MS = 30_000;

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

/**
 * Reads the `e2eStability` sensor from the same report `/ai-health` renders,
 * rather than probing an endpoint of its own — the two pages are reporting
 * on the same underlying signal and must not disagree about it (#9016).
 * `degraded`, never `error`, when the sensor itself reports Unavailable —
 * the fetch succeeded, so this is a known data gap, not an outage.
 */
async function checkE2eStability(): Promise<Omit<ServiceStatus, "name" | "url">> {
  const start = Date.now();
  try {
    const response = await fetch(STATUS_SENSOR_REPORT_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    const latency = Date.now() - start;
    if (!response.ok) {
      return { status: "error", latency, checkedAt: new Date().toISOString() };
    }
    const data = await response.json();
    const sensor = data?.sensors?.e2eStability ?? {};
    const available = sensor.available === true;
    return {
      status: available ? "ok" : "degraded",
      latency,
      checkedAt: new Date().toISOString(),
      note: available ? undefined : (describeSensorGap(sensor) ?? undefined),
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

export function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({ ...s, status: "loading" as const }))
  );
  const [sites, setSites] = useState<ServiceStatus[]>(
    STATIC_SITES.map((s) => ({ ...s, status: "loading" as const }))
  );
  const [e2eSensor, setE2eSensor] = useState<ServiceStatus>({
    name: E2E_SENSOR_NAME,
    url: STATUS_SENSOR_REPORT_URL,
    status: "loading",
  });
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [serviceResults, siteResults, e2eResult] = await Promise.all([
      Promise.all(SERVICES.map(async (s) => ({ ...s, ...(await checkService(s.url)) }))),
      Promise.all(STATIC_SITES.map(async (s) => ({ ...s, ...(await checkStaticSite(s.url)) }))),
      checkE2eStability(),
    ]);
    setServices(serviceResults);
    setSites(siteResults);
    setE2eSensor({ name: E2E_SENSOR_NAME, url: STATUS_SENSOR_REPORT_URL, ...e2eResult });
    setLastRefresh(new Date().toISOString());
  }, []);

  useEffect(() => {
    // Initial fetch on mount — intentionally calls setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const allStatuses = [...services, ...sites, e2eSensor];
  const overall = overallStatus(allStatuses);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>System Status</Heading>
        <div className={styles.overallStatus} data-testid="overall-status">
          <Badge color={statusColor(overall)} size="md">
            {overall === "loading" ? "Checking..." : statusLabel(overall)}
          </Badge>
        </div>
        {/* Always rendered so the line's height is reserved before the first probe round. */}
        <Text className={styles.lastChecked}>
          {lastRefresh
            ? `Last checked: ${new Date(lastRefresh).toLocaleTimeString()} · Refreshes every 30s`
            : "Checking services…"}
        </Text>
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
                  <Badge color={statusColor(service.status)}>{statusLabel(service.status)}</Badge>
                )}
              </div>
              {service.latency !== undefined && (
                <Text className={styles.meta}>
                  {`Latency: ${service.latency}ms`}
                  {service.version && (
                    <>
                      {" · "}
                      <code className={styles.version} title={`v${service.version}`}>
                        {`v${service.version}`}
                      </code>
                    </>
                  )}
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
                  <Badge color={statusColor(site.status)}>{statusLabel(site.status)}</Badge>
                )}
              </div>
              {site.latency !== undefined && (
                <Text className={styles.meta}>Latency: {site.latency}ms</Text>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>CI Signals</Heading>
        <div className={styles.serviceGrid}>
          <Card className={styles.card}>
            <div className={styles.cardHeader}>
              <Text className={styles.serviceName}>{e2eSensor.name}</Text>
              {e2eSensor.status === "loading" ? (
                <Spinner size="sm" />
              ) : (
                <Badge color={statusColor(e2eSensor.status)}>{statusLabel(e2eSensor.status)}</Badge>
              )}
            </div>
            {e2eSensor.note && <Text className={styles.signalNote}>{e2eSensor.note}</Text>}
          </Card>
        </div>
      </section>
    </div>
  );
}
