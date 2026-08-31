import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { Dashboard } from "./Dashboard";

// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees). Dashboard renders its
// Skeleton-based loading state on mount (a 1.5s timer flips it to the full
// grid), so only the always-rendered surface — PageHeader's breadcrumbs and
// the always-visible rows — needs a behavioral stub; everything else is a
// lean passthrough that just needs to not throw.
vi.mock("@mattbutlerengineering/rialto", () => {
  const PageHeader = ({
    breadcrumbs,
    title,
  }: {
    breadcrumbs?: { label: string; href?: string }[];
    title?: string;
  }) => (
    <header>
      <nav aria-label="breadcrumb">
        {breadcrumbs?.map((item) =>
          item.href ? (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ) : (
            <span key={item.label}>{item.label}</span>
          )
        )}
      </nav>
      <h1>{title}</h1>
    </header>
  );
  function Passthrough({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }
  return {
    Alert: Passthrough,
    AvatarGroup: Passthrough,
    Badge: Passthrough,
    Banner: Passthrough,
    Button: Passthrough,
    Card: Passthrough,
    Divider: Passthrough,
    Kbd: Passthrough,
    PageHeader,
    Pagination: Passthrough,
    Progress: Passthrough,
    Select: Passthrough,
    Skeleton: Passthrough,
    Slider: Passthrough,
    Stack: Passthrough,
    Table: Passthrough,
    Tabs: Passthrough,
    Tag: Passthrough,
    Text: Passthrough,
    Timeline: Passthrough,
    Toggle: Passthrough,
    Tooltip: Passthrough,
  };
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard — breadcrumbs", () => {
  it("points the 'Telemetry' breadcrumb at the telemetry demo instead of a dead '#' link", () => {
    renderDashboard();

    const telemetryLink = screen.getByRole("link", { name: "Telemetry" });
    expect(telemetryLink).toHaveAttribute("href", "/demos/telemetry");
  });
});
