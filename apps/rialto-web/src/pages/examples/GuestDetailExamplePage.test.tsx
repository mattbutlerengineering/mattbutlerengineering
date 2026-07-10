import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ElementType, type KeyboardEvent, type ReactNode } from "react";
import {
  GuestDetailExamplePage,
  GUEST,
  PAST_STAYS,
  UPCOMING_RESERVATIONS,
  ACTIVITY,
  totalNights,
  lifetimeSpend,
  formatCurrency,
  sortByMostRecent,
  type GuestStay,
} from "./GuestDetailExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs are *behavioral* where the assertions
// depend on behavior: Tabs keeps active-tab state, emits the WAI-ARIA
// tablist/tab/tabpanel contract, and mirrors the real component's
// ArrowLeft/ArrowRight/Home/End keyboard handling, so the page's tab wiring is
// what the keyboard tests exercise. Avatar, Badge, Stat, DataList, DataTable,
// and Timeline preserve the semantics (roles, labels, variants) the header and
// panel assertions inspect. None of them reimplement page logic.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  interface MockTab {
    id: string;
    label: string;
    disabled?: boolean;
    content: ReactNode;
  }

  const Tabs = ({
    tabs,
    defaultTab,
    onTabChange,
  }: {
    tabs: MockTab[];
    defaultTab?: string;
    onTabChange?: (tabId: string) => void;
  }) => {
    const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id ?? "");
    const selectTab = (id: string) => {
      setActiveId(id);
      onTabChange?.(id);
    };
    // Mirror of the real Tabs keyboard handler (ArrowRight/ArrowLeft/Home/End
    // over enabled tabs, wrapping at the edges).
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const enabled = tabs.filter((t) => !t.disabled);
      const current = enabled.findIndex((t) => t.id === activeId);
      let next: number;
      if (e.key === "ArrowRight") next = (current + 1) % enabled.length;
      else if (e.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = enabled.length - 1;
      else return;
      e.preventDefault();
      const tab = enabled[next];
      if (tab) selectTab(tab.id);
    };
    const active = tabs.find((t) => t.id === activeId);
    return (
      <div>
        <div role="tablist" tabIndex={-1} onKeyDown={handleKeyDown}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={tab.id === activeId}
              aria-controls={`panel-${tab.id}`}
              tabIndex={tab.id === activeId ? 0 : -1}
              onClick={tab.disabled ? undefined : () => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {active && (
          <div role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>
            {active.content}
          </div>
        )}
      </div>
    );
  };

  const Avatar = ({ name, size }: { name?: string; size?: string }) => (
    <div data-testid="avatar" data-size={size} aria-hidden="true">
      {name
        ?.split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}
    </div>
  );

  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );

  const Stat = ({ label, value }: { label: string; value?: ReactNode }) => (
    <div role="group" aria-label={label}>
      <span>{label}</span>
      <span data-testid="stat-value">{value}</span>
    </div>
  );

  const DataList = ({ items }: { items: { label: string; value: ReactNode }[] }) => (
    <dl>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );

  const DataTable = ({
    columns,
    data,
    rowKey,
    label,
  }: {
    columns: {
      key: string;
      header: string;
      render?: (row: Record<string, unknown>) => ReactNode;
    }[];
    data: Record<string, unknown>[];
    rowKey: (row: Record<string, unknown>) => string | number;
    label?: string;
  }) => (
    <table aria-label={label}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={rowKey(row)} data-testid="data-row" data-row={String(rowKey(row))}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const Timeline = ({
    events,
  }: {
    events: { title: string; description?: string; timestamp?: string; status?: string }[];
  }) => (
    <div role="list" aria-label="Timeline">
      {events.map((event) => (
        <div key={event.title} role="listitem">
          <span>{event.timestamp}</span>
          <span>{event.title}</span>
          {event.description && <span>{event.description}</span>}
        </div>
      ))}
    </div>
  );

  const Text = ({
    as,
    children,
    variant: _variant,
    color: _color,
  }: {
    as?: ElementType;
    children?: ReactNode;
    variant?: string;
    color?: string;
  }) => {
    const Tag = as ?? "span";
    return <Tag>{children}</Tag>;
  };

  const Card = ({ title, children }: { title?: string; children?: ReactNode }) => (
    <div data-testid="card">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );

  return {
    Tabs,
    Avatar,
    Badge,
    Stat,
    DataList,
    DataTable,
    Timeline,
    Text,
    Card,
    Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Divider: () => <hr />,
    Button: ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => (
      <button type="button" {...rest}>
        {children}
      </button>
    ),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<GuestDetailExamplePage />);
}

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name });
}

function activePanel(): HTMLElement {
  return screen.getByRole("tabpanel");
}

// ---------------------------------------------------------------------------
// Pure logic — no components involved
// ---------------------------------------------------------------------------

describe("GuestDetailExamplePage — pure helpers", () => {
  const stays: GuestStay[] = [
    {
      id: "S-1",
      room: "Suite 402",
      checkIn: "2025-01-10",
      checkOut: "2025-01-13",
      nights: 3,
      total: 900,
      status: "completed",
    },
    {
      id: "S-2",
      room: "Deluxe 218",
      checkIn: "2025-06-02",
      checkOut: "2025-06-04",
      nights: 2,
      total: 400,
      status: "cancelled",
    },
    {
      id: "S-3",
      room: "Standard 115",
      checkIn: "2025-03-20",
      checkOut: "2025-03-25",
      nights: 5,
      total: 750,
      status: "completed",
    },
  ];

  it("totalNights sums nights of completed stays only", () => {
    expect(totalNights(stays)).toBe(8);
    expect(totalNights([])).toBe(0);
  });

  it("lifetimeSpend sums totals of completed stays only", () => {
    expect(lifetimeSpend(stays)).toBe(1650);
    expect(lifetimeSpend([])).toBe(0);
  });

  it("formatCurrency renders whole US dollars", () => {
    expect(formatCurrency(1650)).toBe("$1,650");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("sortByMostRecent orders by check-in descending without mutating input", () => {
    const input = [...stays];
    const sorted = sortByMostRecent(input);
    expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-3", "S-1"]);
    expect(input.map((s) => s.id)).toEqual(["S-1", "S-2", "S-3"]);
  });

  it("fixture stays are unique and dated so history ordering is meaningful", () => {
    expect(PAST_STAYS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(PAST_STAYS.map((s) => s.id)).size).toBe(PAST_STAYS.length);
    for (const stay of PAST_STAYS) {
      expect(stay.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Identity header
// ---------------------------------------------------------------------------

describe("GuestDetailExamplePage — identity header", () => {
  it("renders the showcase header with page name and description", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Guest Profile" })).toBeInTheDocument();
  });

  it("renders the guest name as a level-2 heading beside an avatar", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 2, name: GUEST.name })).toBeInTheDocument();
    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveTextContent("EM");
  });

  it("shows tier and presence status badges", () => {
    renderPage();
    const badges = screen.getAllByTestId("badge");
    const tier = badges.find((b) => b.textContent === "Gold Member");
    const presence = badges.find((b) => b.textContent === "Checked in");
    expect(tier).toBeDefined();
    expect(tier).toHaveAttribute("data-variant", "accent");
    expect(presence).toBeDefined();
    expect(presence).toHaveAttribute("data-variant", "success");
  });

  it("shows summary stats derived from the stay fixture", () => {
    renderPage();
    const totalStays = screen.getByRole("group", { name: "Total stays" });
    expect(within(totalStays).getByTestId("stat-value")).toHaveTextContent(
      String(PAST_STAYS.length)
    );
    const nights = screen.getByRole("group", { name: "Nights stayed" });
    expect(within(nights).getByTestId("stat-value")).toHaveTextContent(
      String(totalNights(PAST_STAYS))
    );
    const spend = screen.getByRole("group", { name: "Lifetime spend" });
    expect(within(spend).getByTestId("stat-value")).toHaveTextContent(
      formatCurrency(lifetimeSpend(PAST_STAYS))
    );
    const points = screen.getByRole("group", { name: "Loyalty points" });
    expect(within(points).getByTestId("stat-value")).toHaveTextContent(
      GUEST.loyaltyPoints.toLocaleString("en-US")
    );
  });
});

// ---------------------------------------------------------------------------
// Tabs — presence, distinct content, keyboard access
// ---------------------------------------------------------------------------

describe("GuestDetailExamplePage — tabs", () => {
  it("renders overview, history, and related tabs with overview active", () => {
    renderPage();
    expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
    expect(tab("Stay history")).toHaveAttribute("aria-selected", "false");
    expect(tab("Related records")).toHaveAttribute("aria-selected", "false");
  });

  it("overview tab shows contact details and preferences", () => {
    renderPage();
    const panel = activePanel();
    expect(within(panel).getByText("Contact details")).toBeInTheDocument();
    expect(within(panel).getByText(GUEST.email)).toBeInTheDocument();
    expect(within(panel).getByText(GUEST.phone)).toBeInTheDocument();
    expect(within(panel).getByText("Preferences")).toBeInTheDocument();
    expect(within(panel).getByText(GUEST.preferences[0]!.value)).toBeInTheDocument();
  });

  it("history tab lists every past stay, most recent first, with status badges", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(tab("Stay history"));

    const panel = activePanel();
    const table = within(panel).getByRole("table", { name: "Stay history" });
    const rows = within(table).getAllByTestId("data-row");
    expect(rows.map((r) => r.getAttribute("data-row"))).toEqual(
      sortByMostRecent(PAST_STAYS).map((s) => s.id)
    );
    expect(within(table).getAllByTestId("badge").length).toBe(PAST_STAYS.length);
  });

  it("related tab shows upcoming reservations and the activity timeline", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(tab("Related records"));

    const panel = activePanel();
    const upcoming = within(panel).getByRole("table", { name: "Upcoming reservations" });
    expect(within(upcoming).getAllByTestId("data-row").length).toBe(
      UPCOMING_RESERVATIONS.length
    );
    const timeline = within(panel).getByRole("list", { name: "Timeline" });
    expect(within(timeline).getAllByRole("listitem").length).toBe(ACTIVITY.length);
    expect(within(timeline).getByText(ACTIVITY[0]!.title)).toBeInTheDocument();
  });

  it("supports arrow-key navigation across tabs", async () => {
    const user = userEvent.setup();
    renderPage();

    tab("Overview").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Stay history")).toHaveAttribute("aria-selected", "true");
    expect(within(activePanel()).getByRole("table", { name: "Stay history" })).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(tab("Related records")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(tab("Stay history")).toHaveAttribute("aria-selected", "true");
  });

  it("supports Home and End keys", async () => {
    const user = userEvent.setup();
    renderPage();

    tab("Overview").focus();
    await user.keyboard("{End}");
    expect(tab("Related records")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
  });
});
