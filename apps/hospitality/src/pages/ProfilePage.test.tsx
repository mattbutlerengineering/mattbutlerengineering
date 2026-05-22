/* eslint-disable @typescript-eslint/no-explicit-any, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));

const { mockMe, mockUpdate } = vi.hoisted(() => ({
  mockMe: vi.fn(),
  mockUpdate: vi.fn(),
}));
vi.mock("@mbe/api-client", () => ({
  ApiClient: vi.fn(function (this: any) {}),
  UsersClient: vi.fn(function (this: any) {
    this.me = mockMe;
    this.update = mockUpdate;
  }),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
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

import { useAuth } from "@mbe/auth/react";
import { ProfilePage } from "./ProfilePage.js";

const mockUseAuth = vi.mocked(useAuth);

const mockUser = {
  id: "user-123",
  name: "Test User",
  email: "test@example.com",
  picture: "https://example.com/photo.jpg",
  emailVerified: true,
  createdAt: "2025-01-15T10:00:00Z",
  updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    accessToken: "test-token",
    user: {
      name: "Auth User",
      email: "auth@example.com",
      picture: "https://example.com/auth.jpg",
    },
  } as any);
});

describe("ProfilePage", () => {
  describe("loading state", () => {
    it("shows skeleton group while loading", () => {
      mockMe.mockReturnValue(new Promise(() => {})); // never resolves
      render(<ProfilePage />);

      expect(screen.getAllByTestId("skeleton-group").length).toBeGreaterThan(0);
      expect(screen.getByText("Loading your profile...")).toBeDefined();
    });
  });

  describe("error state", () => {
    it("shows error alert when fetch fails", async () => {
      mockMe.mockRejectedValue(new Error("Network error"));
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByTestId("alert-error")).toBeDefined();
      });
      expect(screen.getByText("Network error")).toBeDefined();
      expect(screen.getByText("Failed to load profile")).toBeDefined();
    });

    it("shows retry button that reloads the page", async () => {
      mockMe.mockRejectedValue(new Error("Network error"));
      const reloadSpy = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...window.location, reload: reloadSpy },
        writable: true,
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeDefined();
      });

      fireEvent.click(screen.getByText("Retry"));
      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe("loaded state", () => {
    beforeEach(() => {
      mockMe.mockResolvedValue(mockUser);
    });

    it("displays user name and email", async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        // Name appears in both Avatar mock and hero info Text
        expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
      });
      expect(screen.getByText("test@example.com")).toBeDefined();
    });

    it("shows Edit Profile button", async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });
    });

    it("shows account details with user ID and email verified badge", async () => {
      render(<ProfilePage />);

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
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getAllByText("Member Since").length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText("January 2025").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Last Updated").length).toBeGreaterThan(0);
    });
  });

  describe("edit mode", () => {
    beforeEach(() => {
      mockMe.mockResolvedValue(mockUser);
    });

    it("clicking Edit Profile shows edit form with name and picture inputs", async () => {
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      expect(screen.getByPlaceholderText("Your name")).toBeDefined();
      expect(screen.getByPlaceholderText("https://example.com/photo.jpg")).toBeDefined();
    });

    it("name input is pre-filled with user name", async () => {
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      const nameInput = screen.getByPlaceholderText("Your name") as HTMLInputElement;
      expect(nameInput.value).toBe("Test User");
    });

    it("clearing name shows validation error and disables Save", async () => {
      const user = userEvent.setup();
      render(<ProfilePage />);

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

    it("save calls usersClient.update with correct data", async () => {
      const updatedUser = { ...mockUser, name: "Updated Name" };
      mockUpdate.mockResolvedValue(updatedUser);

      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeDefined();
      });

      await user.click(screen.getByText("Edit Profile"));

      const nameInput = screen.getByPlaceholderText("Your name");
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Name");

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith("user-123", {
          name: "Updated Name",
          picture: "https://example.com/photo.jpg",
        });
      });
    });

    it("save success shows success alert", async () => {
      mockUpdate.mockResolvedValue({ ...mockUser, name: "Updated" });

      const user = userEvent.setup();
      render(<ProfilePage />);

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
      mockUpdate.mockRejectedValue(new Error("Save failed"));

      const user = userEvent.setup();
      render(<ProfilePage />);

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
      render(<ProfilePage />);

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
      mockMe.mockResolvedValue({
        ...mockUser,
        createdAt: "2024-06-20T00:00:00Z",
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getAllByText("June 2024").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows Just now for recent updates", async () => {
      mockMe.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date().toISOString(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getAllByText("Just now").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows minutes ago", async () => {
      mockMe.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getAllByText("5m ago").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows hours ago", async () => {
      mockMe.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getAllByText("3h ago").length).toBeGreaterThan(0);
      });
    });

    it("formatRelativeTime shows days ago", async () => {
      mockMe.mockResolvedValue({
        ...mockUser,
        updatedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getAllByText("7d ago").length).toBeGreaterThan(0);
      });
    });
  });
});
