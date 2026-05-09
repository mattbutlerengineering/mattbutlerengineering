/**
 * Unit tests for the Sidebar component.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";

const user = userEvent.setup();

const flatItems = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "profile", label: "Profile", href: "/profile", active: true },
];

describe("Sidebar", () => {
  it("renders navigation with items", () => {
    render(<Sidebar items={flatItems} />);
    expect(screen.getByRole("navigation", { name: /sidebar navigation/i })).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("renders items as links when href is provided", () => {
    render(<Sidebar items={flatItems} />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  it("marks active item with aria-current=page", () => {
    render(<Sidebar items={flatItems} />);
    const profileLink = screen.getByRole("link", { name: /profile/i });
    expect(profileLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark non-active items as current", () => {
    render(<Sidebar items={flatItems} />);
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).not.toHaveAttribute("aria-current");
  });

  it("renders button items when no href", () => {
    const onClick = vi.fn();
    render(
      <Sidebar
        items={[
          { id: "logout", label: "Logout", onClick },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  it("calls onClick when button item is clicked", async () => {
    const onClick = vi.fn();
    render(
      <Sidebar
        items={[
          { id: "logout", label: "Logout", onClick },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /logout/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders icons when provided", () => {
    render(
      <Sidebar
        items={[
          {
            id: "home",
            label: "Home",
            href: "/",
            icon: <span data-testid="home-icon">H</span>,
          },
        ]}
      />
    );
    expect(screen.getByTestId("home-icon")).toBeInTheDocument();
  });

  it("renders collapse toggle button when onCollapse is provided", () => {
    render(<Sidebar items={flatItems} onCollapse={vi.fn()} />);
    expect(screen.getByRole("button", { name: /collapse sidebar/i })).toBeInTheDocument();
  });

  it("does not render toggle when onCollapse is not provided", () => {
    render(<Sidebar items={flatItems} />);
    expect(screen.queryByRole("button", { name: /collapse/i })).not.toBeInTheDocument();
  });

  it("calls onCollapse with true when collapse button clicked (expanded state)", async () => {
    const onCollapse = vi.fn();
    render(<Sidebar items={flatItems} collapsed={false} onCollapse={onCollapse} />);
    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(onCollapse).toHaveBeenCalledWith(true);
  });

  it("calls onCollapse with false when expand button clicked (collapsed state)", async () => {
    const onCollapse = vi.fn();
    render(<Sidebar items={flatItems} collapsed onCollapse={onCollapse} />);
    await user.click(screen.getByRole("button", { name: /expand sidebar/i }));
    expect(onCollapse).toHaveBeenCalledWith(false);
  });

  it("collapsed label shows 'Expand sidebar'", () => {
    render(<Sidebar items={flatItems} collapsed onCollapse={vi.fn()} />);
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it("renders sectioned items with section labels", () => {
    render(
      <Sidebar
        items={[
          {
            label: "Main",
            items: [
              { id: "home", label: "Home", href: "/" },
            ],
          },
          {
            label: "Admin",
            items: [
              { id: "users", label: "Users", href: "/users" },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("hides section labels when collapsed", () => {
    render(
      <Sidebar
        collapsed
        items={[
          {
            label: "Main",
            items: [{ id: "home", label: "Home", href: "/" }],
          },
        ]}
      />
    );
    expect(screen.queryByText("Main")).not.toBeInTheDocument();
  });

  it("marks disabled items", () => {
    render(
      <Sidebar
        items={[
          { id: "disabled", label: "Disabled Item", disabled: true },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: /disabled item/i })).toBeDisabled();
  });
});
