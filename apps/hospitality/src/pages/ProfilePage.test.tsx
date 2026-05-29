/* eslint-disable @typescript-eslint/no-explicit-any, @eslint-react/no-array-index-key */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(() => ({
    user: {
      name: "Auth User",
      email: "auth@example.com",
      picture: "https://example.com/auth.jpg",
    },
  })),
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

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <div data-testid="error-retry-banner">
      <span>{error}</span>
      <button data-testid="retry-button" onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("./ProfilePage.module.css", () => ({
  default: {
    hero: "hero",
    heroAvatar: "heroAvatar",
    heroInfo: "heroInfo",
    heroAction: "heroAction",
    editPanel: "editPanel",
    editPanelOpen: "editPanelOpen",
    editHeader: "editHeader",
    sectionHeader: "sectionHeader",
    activityGrid: "activityGrid",
    activityItem: "activityItem",
    retryWrapper: "retryWrapper",
    heroSkeleton: "heroSkeleton",
    heroSkeletonText: "heroSkeletonText",
    avatarRing: "avatarRing",
  },
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children, variant, title, dismissible, onDismiss }: any) => (
    <div data-testid={`alert-${variant}`} role="alert">
      <strong>{title}</strong>
      {children}
      {dismissible && <button onClick={onDismiss}>Dismiss</button>}
    </div>
  ),
  Avatar: ({ name, src: _src }: any) => <div data-testid="avatar">{name}</div>,
  Badge: ({ children, variant }: any) => <span data-testid={`badge-${variant}`}>{children}</span>,
  Button: ({ children, onClick, disabled, variant }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  DataList: ({ items }: any) => (
    <dl data-testid="data-list">
      {items?.map((item: any, i: number) => (
        <div key={i}>
          <dt>{item.label}</dt>
          <dd>{typeof item.value === "string" ? item.value : item.value}</dd>
        </div>
      ))}
    </dl>
  ),
  Divider: () => <hr />,
  Input: ({
    label,
    value,
    onChange,
    placeholder,
    error,
    hint,
    required,
    showOptional,
    type,
  }: any) => (
    <div>
      <label>
        {label}
        {showOptional && " (optional)"}
      </label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error}
        type={type || "text"}
        required={required}
      />
      {hint && <span data-testid="hint">{hint}</span>}
    </div>
  ),
  Skeleton: ({ variant }: any) => <div data-testid={`skeleton-${variant}`} />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

import { ProfilePage } from "./ProfilePage.js";

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
  return render(<Wrapper><ProfilePage /></Wrapper>);
}

const mockUser = {
  id: "user-123",
  name: "Test User",
  email: "test@example.com",
  picture: "https://example.com/photo.jpg",
  emailVerified: true,
  createdAt: "2025-01-15T10:00:00Z",
  updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  preferences: { theme: "system", emailNotifications: true, marketingEmails: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApiClient.users.me.mockResolvedValue(mockUser);
});

describe("ProfilePage", () => {
  describe("loading state", () => {
    it("shows skeleton group while loading", () => {
      mockApiClient.users.me.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();

      expect(screen.getAllByTestId("skeleton-group").length).toBeGreaterThan(0);
      expect(screen.getByText("Loading your profile...")).toBeDefined();
    });
  });

  describe("error state", () => {
    it("shows ErrorRetryBanner when fetch fails", async () => {
      mockApiClient.users.me.mockRejectedValue(new Error("Network error"));
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("error-retry-banner")).toBeDefined();
      });
      expect(screen.getByText("Network error")).toBeDefined();
    });

    it("retries fetch via refetch when retry button is clicked", async () => {
      mockApiClient.users.me
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValue(mockUser);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("error-retry-banner")).toBeDefined();
      });

      screen.getByTestId("retry-button").click();

      await waitFor(() => {
        expect(screen.queryByTestId("error-retry-banner")).toBeNull();
        expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
      });
    });
  });

  describe("loaded state", () => {
    it("displays user name and email", async () => {
      renderPage();

      await waitFor(() => {
        // Name appears in both Avatar mock and hero info Text
        expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
      });
      expect(screen.getByText("test@example.com")).toBeDefined();
    });

    it("shows Edit Profile button", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });
    });

    it("shows account details with user ID and email verified badge", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("User ID")).toBeDefined();
      });
      expect(screen.getByText("user-123")).toBeDefined();
      expect(screen.getByText("Email Verified")).toBeDefined();

      const successBadges = screen.getAllByTestId("badge-success");
      expect(successBadges.length).toBeGreaterThan(0);
      expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    });

    it("shows member since and last updated in account details", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("Member Since").length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText("January 2025").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Last Updated").length).toBeGreaterThan(0);
    });
  });

  describe("edit mode", () => {
    it("clicking Edit Profile shows edit form with name and picture inputs", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      expect(screen.getByPlaceholderText("Your name")).toBeDefined();
      expect(screen.getByPlaceholderText("https://example.com/photo.jpg")).toBeDefined();
    });

    it("name input is pre-filled with user name", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      const nameInput = screen.getByPlaceholderText("Your name") as HTMLInputElement;
      expect(nameInput.value).toBe("Test User");
    });

    it("clearing name shows validation error and disables Save", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      const nameInput = screen.getByPlaceholderText("Your name");
      await user.clear(nameInput);

      expect(screen.getByTestId("hint").textContent).toBe("Name is required");
      const saveBtn = screen.getByText("Save Changes") as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it("save calls users.update with correct data", async () => {
      const updatedUser = { ...mockUser, name: "Updated Name" };
      mockApiClient.users.update.mockResolvedValue(updatedUser);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      const nameInput = screen.getByPlaceholderText("Your name");
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Name");

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockApiClient.users.update).toHaveBeenCalledWith("user-123", {
          name: "Updated Name",
          picture: "https://example.com/photo.jpg",
        });
      });
    });

    it("save success shows success alert", async () => {
      mockApiClient.users.update.mockResolvedValue({ ...mockUser, name: "Updated" });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));
      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-success")).toBeDefined();
      });
      expect(screen.getByText("Profile updated")).toBeDefined();
    });

    it("save error shows error alert", async () => {
      mockApiClient.users.update.mockRejectedValue(new Error("Save failed"));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));
      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByTestId("alert-error")).toBeDefined();
      });
      expect(screen.getByText("Save failed")).toBeDefined();
    });

    it("cancel reverts form data and hides edit form", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      const nameInput = screen.getByPlaceholderText("Your name");
      await user.clear(nameInput);
      await user.type(nameInput, "Changed Name");

      await user.click(screen.getByText("Cancel"));

      // Edit form hidden, Edit Profile button visible again
      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      // Re-open to verify data reverted
      await user.click(screen.getByText("Edit Profile"));
      const revertedInput = screen.getByPlaceholderText("Your name") as HTMLInputElement;
      expect(revertedInput.value).toBe("Test User");
    });
  });

  describe("helper functions via rendered output", () => {
    it("formatMemberSince formats date correctly", async () => {
      mockApiClient.users.me.mockResolvedValue({
        ...mockUser,
        createdAt: "2024-06-20T00:00:00Z",
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("June 2024").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows Just now for recent updates", async () => {
      mockApiClient.users.me.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date().toISOString(),
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("Just now").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows minutes ago", async () => {
      mockApiClient.users.me.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("5m ago").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows hours ago", async () => {
      mockApiClient.users.me.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("3h ago").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows days ago", async () => {
      mockApiClient.users.me.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("7d ago").length).toBeGreaterThan(0);
      });
    });
  });
});
