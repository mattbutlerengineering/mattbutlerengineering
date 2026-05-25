import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.js";
import { useAuth } from "@mbe/auth/react";
import type { AuthUser, JWTPayload } from "@mbe/auth";
import { useTheme } from "../hooks/use-theme.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("../hooks/use-theme.js", () => ({
  useTheme: vi.fn(),
}));

const mockApiClient = {
  users: {
    me: vi.fn(),
    update: vi.fn(),
    updatePreferences: vi.fn(),
    list: vi.fn(),
  },
};

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => mockApiClient),
}));

// ApiClientError is still imported in the page
vi.mock("@mbe/api-client", () => ({
  ApiClientError: class extends Error {
    response: Record<string, unknown>;
    constructor(message: string, response: Record<string, unknown> = {}) {
      super(message);
      this.response = response;
    }
  },
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({
    children,
    variant,
    onDismiss,
  }: {
    children: React.ReactNode;
    variant?: string;
    onDismiss?: () => void;
  }) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
      {onDismiss && (
        <button data-testid="alert-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-testid="card">
      <h1>{title}</h1>
      {children}
    </div>
  ),
  Divider: () => <hr />,
  Select: (props: {
    label?: string;
    value?: string;
    options?: Array<{ value: string; label: string }>;
    onChange?: (value: string) => void;
  }) => (
    <div>
      <label>{props.label}</label>
      <select
        data-testid={`select-${props.label}`}
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
      >
        {props.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Toggle: ({
    label,
    checked,
    onCheckedChange,
  }: {
    label?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
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

// ── Typed mock factories ─────────────────────────────────────────────────────

function makeJWTPayload(overrides: Partial<JWTPayload> = {}): JWTPayload {
  return {
    sub: "user-1",
    iss: "https://test.auth0.com/",
    aud: "https://api.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    name: "Test User",
    email: "test@example.com",
    ...overrides,
  };
}

function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    raw: makeJWTPayload(),
    ...overrides,
  };
}

type AuthReturnType = ReturnType<typeof useAuth>;

function makeAuthResult(overrides: Partial<AuthReturnType> = {}): AuthReturnType {
  return {
    isLoading: false,
    isAuthenticated: true,
    user: makeAuthUser(),
    accessToken: "token",
    signIn: vi.fn(),
    signOut: vi.fn(),
    signInSilent: vi.fn(),
    error: undefined,
    ...overrides,
  };
}

// ── Test helpers ─────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <SettingsPage />
    </Wrapper>
  );
}

const defaultUser = {
  id: "u1",
  name: "Test User",
  email: "test@example.com",
  preferences: { theme: "system", emailNotifications: true, marketingEmails: false },
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.mocked(useAuth).mockReturnValue(makeAuthResult());

    vi.mocked(useTheme).mockReturnValue({
      theme: "system",
      setTheme: vi.fn(),
    });

    mockApiClient.users.me.mockResolvedValue(defaultUser);
    mockApiClient.users.updatePreferences.mockResolvedValue(defaultUser);
  });

  it("renders the settings page header", async () => {
    renderPage();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("renders theme selection after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Theme")).toBeDefined();
    });
  });

  it("renders venue defaults card after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Venue Defaults")).toBeDefined();
    });
  });

  it("renders notifications card after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Notifications")).toBeDefined();
    });
  });

  it("renders sign out button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sign Out")).toBeDefined();
    });
  });

  describe("loading skeleton", () => {
    it("shows skeleton when auth is loading", () => {
      vi.mocked(useAuth).mockReturnValue(
        makeAuthResult({ accessToken: null, isLoading: true, user: null })
      );

      renderPage();
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    });

    it("shows skeleton while user data is fetching", () => {
      mockApiClient.users.me.mockReturnValue(new Promise(() => {})); // never resolves

      renderPage();
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

      mockApiClient.users.updatePreferences.mockResolvedValue({
        ...defaultUser,
        preferences: { theme: "dark" },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("select-Theme")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("select-Theme"), {
        target: { value: "dark" },
      });

      expect(mockSetTheme).toHaveBeenCalledWith("dark");
      await waitFor(() => {
        expect(mockApiClient.users.updatePreferences).toHaveBeenCalledWith({ theme: "dark" });
      });
    });
  });

  describe("notification toggles", () => {
    it("calls updatePreferences when email notifications toggled", async () => {
      mockApiClient.users.updatePreferences.mockResolvedValue({
        ...defaultUser,
        preferences: { emailNotifications: false },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("toggle-Email notifications")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-Email notifications"));

      await waitFor(() => {
        expect(mockApiClient.users.updatePreferences).toHaveBeenCalledWith({
          emailNotifications: false,
        });
      });
    });

    it("calls updatePreferences when marketing emails toggled", async () => {
      mockApiClient.users.updatePreferences.mockResolvedValue({
        ...defaultUser,
        preferences: { marketingEmails: true },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("toggle-Marketing emails")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-Marketing emails"));

      await waitFor(() => {
        expect(mockApiClient.users.updatePreferences).toHaveBeenCalledWith({
          marketingEmails: true,
        });
      });
    });
  });

  describe("sign out", () => {
    it("calls signOut when sign out button is clicked", async () => {
      const mockSignOut = vi.fn();
      vi.mocked(useAuth).mockReturnValue(makeAuthResult({ signOut: mockSignOut }));

      renderPage();

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

      renderPage();

      await waitFor(() => {
        const select = screen.getByTestId(
          "select-Default reservation duration"
        ) as HTMLSelectElement;
        expect(select.value).toBe("90");
      });
    });

    it("writes duration to localStorage on change", async () => {
      renderPage();

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

      renderPage();

      await waitFor(() => {
        const select = screen.getByTestId("select-Default party size") as HTMLSelectElement;
        expect(select.value).toBe("6");
      });
    });

    it("writes party size to localStorage on change", async () => {
      renderPage();

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

      renderPage();

      await waitFor(() => {
        const toggle = screen.getByTestId("toggle-Auto-confirm reservations") as HTMLInputElement;
        expect(toggle.checked).toBe(true);
      });
    });

    it("writes auto-confirm to localStorage on change", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("toggle-Auto-confirm reservations")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-Auto-confirm reservations"));

      expect(localStorage.getItem("mbe-hospitality-auto-confirm")).toBe("true");
    });
  });

  describe("save success and error alerts", () => {
    it("shows success alert after saving preferences", async () => {
      mockApiClient.users.updatePreferences.mockResolvedValue({
        ...defaultUser,
        preferences: { theme: "dark" },
      });

      renderPage();

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
      mockApiClient.users.updatePreferences.mockRejectedValue(new Error("Network error"));

      renderPage();

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
  });

  describe("account sidebar", () => {
    it("displays user email in sidebar", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("test@example.com")).toBeDefined();
      });
    });

    it("renders Data & Privacy card", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Data & Privacy")).toBeDefined();
      });
    });

    it("renders export and delete buttons as disabled", async () => {
      renderPage();

      await waitFor(() => {
        const exportBtn = screen.getByText("Export") as HTMLButtonElement;
        const deleteBtn = screen.getByText("Delete") as HTMLButtonElement;
        expect(exportBtn.disabled).toBe(true);
        expect(deleteBtn.disabled).toBe(true);
      });
    });
  });
});
