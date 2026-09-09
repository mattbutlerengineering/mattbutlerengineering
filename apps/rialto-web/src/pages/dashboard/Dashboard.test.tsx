import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Dashboard } from "./Dashboard";

// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees). Dashboard renders its
// Skeleton-based loading state on mount (a 1.5s timer flips it to the full
// grid), so only the always-rendered surface — PageHeader's breadcrumbs and
// the always-visible rows — needs a behavioral stub; everything else is a
// lean passthrough that just needs to not throw.
//
// The PageHeader stub mirrors the REAL Breadcrumb component's semantics
// (packages/rialto/src/components/Breadcrumb/Breadcrumb.tsx): an item with
// `href` renders as a plain `<a href>` (which does a hard, basename-bypassing
// navigation — the exact defect #4806's follow-up fixes), an item with only
// `onClick` renders as a `<button>`. A naive mock that always renders an
// anchor from `href` would pass even on the broken source, the way the prior
// version of this test did.
vi.mock("@mattbutlerengineering/rialto", () => {
  const PageHeader = ({
    breadcrumbs,
    title,
  }: {
    breadcrumbs?: { label: string; href?: string; onClick?: () => void }[];
    title?: string;
  }) => (
    <header>
      <nav aria-label="breadcrumb">
        {breadcrumbs?.map((item) =>
          item.href ? (
            <a key={item.label} href={item.href} onClick={item.onClick}>
              {item.label}
            </a>
          ) : item.onClick ? (
            <button key={item.label} type="button" onClick={item.onClick}>
              {item.label}
            </button>
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

function renderDashboardWithRoutes() {
  return render(
    <MemoryRouter initialEntries={["/demos/dashboard"]}>
      <Routes>
        <Route path="/demos/dashboard" element={<Dashboard />} />
        <Route path="/demos/telemetry" element={<div data-testid="telemetry-page" />} />
        <Route path="/" element={<div data-testid="overview-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Dashboard — breadcrumbs", () => {
  it("router-navigates the 'Telemetry' breadcrumb instead of doing a hard navigation via href", () => {
    renderDashboardWithRoutes();

    const telemetryCrumb = screen.getByRole("button", { name: "Telemetry" });
    fireEvent.click(telemetryCrumb);

    expect(screen.getByTestId("telemetry-page")).toBeInTheDocument();
  });

  it("router-navigates the 'Home' breadcrumb to the design-system overview instead of doing a hard navigation via href", () => {
    renderDashboardWithRoutes();

    const homeCrumb = screen.getByRole("button", { name: "Home" });
    fireEvent.click(homeCrumb);

    expect(screen.getByTestId("overview-page")).toBeInTheDocument();
  });
});
