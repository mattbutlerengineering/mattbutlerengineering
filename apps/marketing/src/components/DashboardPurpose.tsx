import { Fragment } from "react";
import { Text } from "@mattbutlerengineering/rialto";

type DashboardPath = "/metrics" | "/ai-health" | "/acmm";

const DASHBOARDS: readonly { path: DashboardPath; label: string; purpose: string }[] = [
  {
    path: "/metrics",
    label: "Metrics",
    purpose: "Delivery outcomes: throughput, CI and quality.",
  },
  { path: "/ai-health", label: "AI health", purpose: "Live sensor status." },
  { path: "/acmm", label: "ACMM", purpose: "The maturity score and its evidence." },
];

/** One-line purpose of a dashboard page, plus links to the other two. */
export function DashboardPurpose({ current }: { current: DashboardPath }) {
  const self = DASHBOARDS.find((d) => d.path === current);
  const others = DASHBOARDS.filter((d) => d.path !== current);

  return (
    <Text>
      {self?.purpose} See also{" "}
      {others.map((d, i) => (
        <Fragment key={d.path}>
          {i > 0 && " and "}
          <a href={d.path}>{d.label}</a>
        </Fragment>
      ))}
      .
    </Text>
  );
}
