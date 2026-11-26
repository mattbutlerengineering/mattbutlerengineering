import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Dashboard } from "./Dashboard";

// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees). Tabs, Table, Button, Tag,
// Banner, and Alert mirror the real focusable surface just enough to assert
// tab order. Everything else is a lean passthrough that just needs to not throw.
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
  function Button({ children }: { children?: ReactNode }) {
    return <button type="button">{children}</button>;
  }
  function Banner({
    children,
    action,
    dismissible,
  }: {
    children?: ReactNode;
    action?: ReactNode;
    dismissible?: boolean;
  }) {
    return (
      <div>
        {children}
        {action}
        {dismissible ? <button type="button">Dismiss</button> : null}
      </div>
    );
  }
  function Alert({
    children,
    title,
    dismissible,
  }: {
    children?: ReactNode;
    title?: string;
    dismissible?: boolean;
  }) {
    return (
      <div>
        {title}
        {children}
        {dismissible ? <button type="button">Dismiss</button> : null}
      </div>
    );
  }
  function Tag({ children, onClick }: { children?: ReactNode; onClick?: () => void }) {
    return (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    );
  }
  function Tabs({ tabs }: { tabs?: { id: string; label: string; content: ReactNode }[] }) {
    return (
      <div>
        <div role="tablist">
          {tabs?.map((tab, index) => (
            <button key={tab.id} type="button" role="tab" tabIndex={index === 0 ? 0 : -1}>
              {tab.label}
            </button>
          ))}
        </div>
        {tabs?.[0]?.content}
      </div>
    );
  }
  function Table({ columns }: { columns?: { key: string; header: string; sortable?: boolean }[] }) {
    return (
      <table>
        <thead>
          <tr>
            {columns?.map((col) => (
              <th key={col.key}>
                {col.sortable ? <button type="button">{col.header}</button> : col.header}
              </th>
            ))}
          </tr>
        </thead>
      </table>
    );
  }
  return {
    Alert,
    AvatarGroup: Passthrough,
    Badge: Passthrough,
    Banner,
    Button,
    Card: ({
      title,
      headingLevel = 3,
      children,
    }: {
      title?: string;
      headingLevel?: 2 | 3 | 4 | 5 | 6;
      children?: ReactNode;
    }) => {
      const Tag = `h${headingLevel}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <section>
          {title && <Tag>{title}</Tag>}
          {children}
        </section>
      );
    },
    Divider: Passthrough,
    Kbd: Passthrough,
    PageHeader,
    Pagination: Passthrough,
    // Mirrors the real Progress: the bar's name comes from aria-label (or label).
    Progress: ({ "aria-label": ariaLabel, label }: { "aria-label"?: string; label?: string }) => (
      <div role="progressbar" aria-label={ariaLabel ?? label} aria-valuenow={72} />
    ),
    Select: Passthrough,
    Skeleton: Passthrough,
    Slider: Passthrough,
    Stack: Passthrough,
    Table,
    Tabs,
    Tag,
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

describe("Dashboard — accessible names", () => {
  it("gives the Lap Progress progressbar an accessible name (axe aria-progressbar-name)", () => {
    renderDashboardWithRoutes();
    expect(screen.getByRole("progressbar", { name: "Lap progress" })).toBeInTheDocument();
  });
});

describe("Dashboard — heading order", () => {
  it("titles the sidebar cards at level 2 so no level is skipped (axe heading-order)", () => {
    renderDashboardWithRoutes();
    for (const name of ["Upcoming Actions", "Active Channels", "Quick Actions"]) {
      expect(screen.getByRole("heading", { name, level: 2 })).toBeInTheDocument();
    }
  });
});

function tabbableLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("a, button, input, select, textarea")]
    .filter((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0)
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());
}

describe("Dashboard — keyboard reachability", () => {
  it("mounts the tablist, sort buttons, channel tags, and quick actions before any timer or scroll", () => {
    const { container } = renderDashboardWithRoutes();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Speed Data",
      "Lap Times",
      "Engine",
    ]);
    // Roving tabindex: the active tab is the only tab stop; the others stay arrow-reachable.
    expect(screen.getByRole("tab", { name: "Speed Data" })).toHaveProperty("tabIndex", 0);

    const labels = tabbableLabels(container);
    const from = labels.indexOf("View Schedule");
    const to = labels.lastIndexOf("Back to Design System →");
    expect(labels.slice(from, to + 1)).toEqual([
      "View Schedule",
      "Dismiss",
      "Speed Data",
      "Zone",
      "Speed (km/h)",
      "Best",
      "Delta",
      "Track",
      "Box",
      "Strategy",
      "Engineer",
      "Call to Pit",
      "Send Message",
      "View Replay",
      "Dismiss",
      "Back to Design System →",
    ]);
  });
});

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
