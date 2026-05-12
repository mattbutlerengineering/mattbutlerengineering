/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    <div data-testid="page-header"><h1>{title}</h1><p>{description}</p></div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Card: ({ children, title }: any) => <div data-testid="card"><h3>{title}</h3>{children}</div>,
  Divider: () => <hr />,
  Select: (props: any) => (
    <div>
      <label>{props.label}</label>
      <select data-testid={`select-${props.label}`} value={props.value} onChange={(e) => props.onChange?.(e.target.value)}>
        {props.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Toggle: ({ label, checked, onChange }: any) => (
    <div>
      <label>{label}</label>
      <input type="checkbox" data-testid={`toggle-${label}`} checked={checked} onChange={(e) => onChange?.(e.target.checked)} />
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
});
