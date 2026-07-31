import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ElementType, ReactNode } from "react";
import { NotificationCenterExamplePage } from "./NotificationCenterExamplePage.js";
import { NOTIFICATIONS } from "./notification-center.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: SegmentedControl emits the WAI-ARIA radiogroup/radio contract with
// real <button> radios (so the All/Unread filter is exercised by click), Badge
// and Text render their content/attributes, and EmptyState renders its
// heading/description so the empty branch is verifiable. None of them
// reimplement the page's filter/read-state logic.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  interface MockSegment {
    id: string;
    label: string;
    disabled?: boolean;
  }
  const SegmentedControl = ({
    segments,
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    segments: MockSegment[];
    value: string;
    onChange: (id: string) => void;
    "aria-label"?: string;
  }) => (
    <div role="radiogroup" aria-label={ariaLabel}>
      {segments.map((segment) => (
        <button
          key={segment.id}
          type="button"
          role="radio"
          aria-checked={segment.id === value}
          onClick={() => onChange(segment.id)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );

  const Badge = ({
    children,
    variant = "neutral",
    "aria-label": ariaLabel,
  }: {
    children?: ReactNode;
    variant?: string;
    "aria-label"?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} aria-label={ariaLabel}>
      {children}
    </span>
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

  const Button = ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );

  const EmptyState = ({ heading, description }: { heading?: string; description?: string }) => (
    <div data-testid="empty-state">
      <h2>{heading}</h2>
      <p>{description}</p>
    </div>
  );

  return {
    SegmentedControl,
    Badge,
    Text,
    Button,
    EmptyState,
    Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Divider: () => <hr />,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<NotificationCenterExamplePage />);
}

function unreadBadge(): HTMLElement {
  return screen.getByLabelText(/unread notification/i);
}

describe("NotificationCenterExamplePage — render", () => {
  it("renders the showcase header with page name", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Notification Center" })
    ).toBeInTheDocument();
  });

  it("renders every fixture notification's title", () => {
    renderPage();
    const list = screen.getByRole("list", { name: "Notifications" });
    for (const notification of NOTIFICATIONS) {
      expect(within(list).getByText(notification.title)).toBeInTheDocument();
    }
  });

  it("exposes the unread count with an accessible label, not a bare number", () => {
    renderPage();
    const badge = unreadBadge();
    expect(badge).toHaveAccessibleName(/\d+ unread notifications?/i);
  });
});

describe("NotificationCenterExamplePage — unread distinction (not colour alone)", () => {
  it("labels unread rows with a text badge", () => {
    renderPage();
    const unreadTitles = NOTIFICATIONS.filter((n) => !n.read).map((n) => n.title);
    expect(unreadTitles.length).toBeGreaterThan(0);
    for (const title of unreadTitles) {
      const row = screen.getByText(title).closest("button")!;
      expect(within(row).getByText("Unread")).toBeInTheDocument();
    }
  });

  it("does not label read rows as unread", () => {
    renderPage();
    const readTitles = NOTIFICATIONS.filter((n) => n.read).map((n) => n.title);
    expect(readTitles.length).toBeGreaterThan(0);
    for (const title of readTitles) {
      const row = screen.getByText(title).closest("button")!;
      expect(within(row).queryByText("Unread")).not.toBeInTheDocument();
    }
  });
});

describe("NotificationCenterExamplePage — filtering", () => {
  it("filters to unread-only notifications", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("radio", { name: "Unread" }));

    const list = screen.getByRole("list", { name: "Notifications" });
    const unreadTitles = NOTIFICATIONS.filter((n) => !n.read).map((n) => n.title);
    const readTitles = NOTIFICATIONS.filter((n) => n.read).map((n) => n.title);

    for (const title of unreadTitles) {
      expect(within(list).getByText(title)).toBeInTheDocument();
    }
    for (const title of readTitles) {
      expect(within(list).queryByText(title)).not.toBeInTheDocument();
    }
  });

  it("shows every notification again when switching back to All", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("radio", { name: "Unread" }));
    await user.click(screen.getByRole("radio", { name: "All" }));

    const list = screen.getByRole("list", { name: "Notifications" });
    for (const notification of NOTIFICATIONS) {
      expect(within(list).getByText(notification.title)).toBeInTheDocument();
    }
  });
});

describe("NotificationCenterExamplePage — marking read", () => {
  it("clicking an unread notification marks it read and decrements the unread count", async () => {
    const user = userEvent.setup();
    renderPage();

    const before = unreadBadge().textContent;
    const target = NOTIFICATIONS.find((n) => !n.read)!;
    await user.click(screen.getByText(target.title));

    expect(unreadBadge().textContent).toBe(String(Number(before) - 1));
    const row = screen.getByText(target.title).closest("button")!;
    expect(within(row).queryByText("Unread")).not.toBeInTheDocument();
  });

  it("Mark all read clears the unread count and every Unread badge", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    expect(unreadBadge().textContent).toBe("0");
    const list = screen.getByRole("list", { name: "Notifications" });
    expect(within(list).queryByText("Unread")).not.toBeInTheDocument();
  });
});

describe("NotificationCenterExamplePage — empty state", () => {
  it("shows an empty state when the Unread filter has no items", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    await user.click(screen.getByRole("radio", { name: "Unread" }));

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Notifications" })).not.toBeInTheDocument();
  });
});
