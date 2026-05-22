/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import { useAuth } from "@mbe/auth/react";
import { useApiClient } from "../hooks/useApiClient.js";
import { useTheme } from "../hooks/use-theme.js";
import { UsersClient } from "@mbe/api-client";
import React from "react";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: vi.fn() }));
vi.mock("../hooks/use-theme.js", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@mbe/api-client", () => ({
  UsersClient: vi.fn(function (this: any) {
    this.me = vi.fn();
    this.updatePreferences = vi.fn();
  }),
  ApiClientError: class extends Error {},
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children, variant, onDismiss }: any) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
      {onDismiss && (
        <button data-testid="alert-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  ),
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, title }: any) => (
    <div data-testid="card">
      <h1>{title}</h1>
      {children}
    </div>
  ),
  Divider: () => <hr />,
  Select: (props: any) => (
    <div>
      <label>{props.label}</label>
      <select
        data-testid={`select-${props.label}`}
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
      >
        {props.options?.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Toggle: ({ label, checked, onCheckedChange }: any) => (
    <div>
      <label>{label}</label>
      <input
        type="checkbox"
        data-testid={`toggle-${label}`}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
    </div>
  ),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.mocked(useAuth).mockReturnValue({
      accessToken: "token",
      isLoading: false,
      signOut: vi.fn(),
      user: { sub: "user-1", name: "Test User", email: "test@example.com" },
    } as any);

    vi.mocked(useTheme).mockReturnValue({
      theme: "system",
      setTheme: vi.fn(),
    });

    vi.mocked(useApiClient).mockReturnValue({
      client: {},
    } as any);

    vi.mocked(UsersClient).mockImplementation(function (this: any) {
      this.me = vi.fn().mockResolvedValue({
        id: "u1",
        name: "Test User",
        email: "test@example.com",
        preferences: { theme: "system", emailNotifications: true, marketingEmails: false },
      });
      this.updatePreferences = vi.fn();
    } as any);
  });

  it("renders the settings page header", async () => {
    render(<SettingsPage />);
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("renders theme selection after loading", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Theme")).toBeDefined();
    });
  });

  it("renders venue defaults card after loading", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Venue Defaults")).toBeDefined();
    });
  });

  it("renders notifications card after loading", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Notifications")).toBeDefined();
    });
  });

  it("renders sign out button", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sign Out")).toBeDefined();
    });
  });

  describe("loading skeleton", () => {
    it("shows skeleton when auth is loading", () => {
      vi.mocked(useAuth).mockReturnValue({
        accessToken: null,
        isLoading: true,
        signOut: vi.fn(),
        user: null,
      } as any);

      render(<SettingsPage />);
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    });

    it("shows skeleton while user data is fetching", () => {
      // me() never resolves so isLoading stays true
      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockReturnValue(new Promise(() => {}));
        this.updatePreferences = vi.fn();
      } as any);

      render(<SettingsPage />);
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    });
  });

  describe("theme change", () => {
    it("calls setTheme and updatePreferences when theme is changed", async () => {
      const mockSetTheme = vi.fn();
      vi.mocked(useTheme).mockReturnValue({
        theme: "system",
        setTheme: mockSetTheme,
      });

      const mockUpdatePreferences = vi.fn().mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        preferences: { theme: "dark" },
      });

      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockResolvedValue({
          id: "u1",
          email: "test@example.com",
          preferences: { theme: "system" },
        });
        this.updatePreferences = mockUpdatePreferences;
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("select-Theme")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("select-Theme"), {
        target: { value: "dark" },
      });

      expect(mockSetTheme).toHaveBeenCalledWith("dark");
      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith({ theme: "dark" });
      });
    });
  });

  describe("notification toggles", () => {
    it("calls updatePreferences when email notifications toggled", async () => {
      const mockUpdatePreferences = vi.fn().mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        preferences: { emailNotifications: false },
      });

      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockResolvedValue({
          id: "u1",
          email: "test@example.com",
          preferences: { theme: "system", emailNotifications: true, marketingEmails: false },
        });
        this.updatePreferences = mockUpdatePreferences;
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("toggle-Email notifications")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-Email notifications"));

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith({ emailNotifications: false });
      });
    });

    it("calls updatePreferences when marketing emails toggled", async () => {
      const mockUpdatePreferences = vi.fn().mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        preferences: { marketingEmails: true },
      });

      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockResolvedValue({
          id: "u1",
          email: "test@example.com",
          preferences: { theme: "system", emailNotifications: true, marketingEmails: false },
        });
        this.updatePreferences = mockUpdatePreferences;
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("toggle-Marketing emails")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-Marketing emails"));

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith({ marketingEmails: true });
      });
    });
  });

  describe("sign out", () => {
    it("calls signOut when sign out button is clicked", async () => {
      const mockSignOut = vi.fn();
      vi.mocked(useAuth).mockReturnValue({
        accessToken: "token",
        isLoading: false,
        signOut: mockSignOut,
        user: { sub: "user-1", name: "Test User", email: "test@example.com" },
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Sign Out")).toBeDefined();
      });

      fireEvent.click(screen.getByText("Sign Out"));
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe("venue defaults (localStorage)", () => {
    it("reads default duration from localStorage", async () => {
      localStorage.setItem("mbe-hospitality-default-duration", "90");

      render(<SettingsPage />);

      await waitFor(() => {
        const select = screen.getByTestId(
          "select-Default reservation duration"
        ) as HTMLSelectElement;
        expect(select.value).toBe("90");
      });
    });

    it("writes duration to localStorage on change", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("select-Default reservation duration")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("select-Default reservation duration"), {
        target: { value: "45" },
      });

      expect(localStorage.getItem("mbe-hospitality-default-duration")).toBe("45");
    });

    it("reads default party size from localStorage", async () => {
      localStorage.setItem("mbe-hospitality-default-party-size", "6");

      render(<SettingsPage />);

      await waitFor(() => {
        const select = screen.getByTestId("select-Default party size") as HTMLSelectElement;
        expect(select.value).toBe("6");
      });
    });

    it("writes party size to localStorage on change", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("select-Default party size")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("select-Default party size"), {
        target: { value: "8" },
      });

      expect(localStorage.getItem("mbe-hospitality-default-party-size")).toBe("8");
    });

    it("reads auto-confirm from localStorage", async () => {
      localStorage.setItem("mbe-hospitality-auto-confirm", "true");

      render(<SettingsPage />);

      await waitFor(() => {
        const toggle = screen.getByTestId("toggle-Auto-confirm reservations") as HTMLInputElement;
        expect(toggle.checked).toBe(true);
      });
    });

    it("writes auto-confirm to localStorage on change", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("toggle-Auto-confirm reservations")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-Auto-confirm reservations"));

      expect(localStorage.getItem("mbe-hospitality-auto-confirm")).toBe("true");
    });
  });

  describe("save success and error alerts", () => {
    it("shows success alert after saving preferences", async () => {
      const mockUpdatePreferences = vi.fn().mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        preferences: { theme: "dark" },
      });

      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockResolvedValue({
          id: "u1",
          email: "test@example.com",
          preferences: { theme: "system" },
        });
        this.updatePreferences = mockUpdatePreferences;
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("select-Theme")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("select-Theme"), {
        target: { value: "dark" },
      });

      await waitFor(() => {
        expect(screen.getByText("Settings saved")).toBeDefined();
      });
    });

    it("shows error alert when saving fails", async () => {
      const mockUpdatePreferences = vi.fn().mockRejectedValue(new Error("Network error"));

      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockResolvedValue({
          id: "u1",
          email: "test@example.com",
          preferences: { theme: "system" },
        });
        this.updatePreferences = mockUpdatePreferences;
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("select-Theme")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("select-Theme"), {
        target: { value: "dark" },
      });

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeDefined();
      });
    });

    it("shows error alert when fetching user fails", async () => {
      vi.mocked(UsersClient).mockImplementation(function (this: any) {
        this.me = vi.fn().mockRejectedValue(new Error("Server down"));
        this.updatePreferences = vi.fn();
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Server down")).toBeDefined();
      });
    });
  });

  describe("account sidebar", () => {
    it("displays user email in sidebar", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("test@example.com")).toBeDefined();
      });
    });

    it("renders Data & Privacy card", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Data & Privacy")).toBeDefined();
      });
    });

    it("renders export and delete buttons as disabled", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const exportBtn = screen.getByText("Export") as HTMLButtonElement;
        const deleteBtn = screen.getByText("Delete") as HTMLButtonElement;
        expect(exportBtn.disabled).toBe(true);
        expect(deleteBtn.disabled).toBe(true);
      });
    });
  });
});
