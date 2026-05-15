/* eslint-disable react/jsx-no-undef, @typescript-eslint/no-explicit-any, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { BookingWidgetDemoPage } from "./BookingWidgetDemoPage.js";
import { useAuth } from "@mbe/auth/react";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));

const { mockVenuesList } = vi.hoisted(() => ({ mockVenuesList: vi.fn() }));
vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(() => ({ venues: { list: mockVenuesList } })),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));
vi.mock("../components/booking-widget", () => ({
  BookingWidget: ({ venueId }: any) => <div data-testid="booking-widget">{venueId}</div>,
}));
vi.mock("./highlight-embed-code.js", () => ({
  highlightEmbedCode: (code: string) => code,
}));
vi.mock("./BookingWidgetDemoPage.module.css", () => ({
  default: {
    container: "container",
    venueSection: "venueSection",
    previewHeader: "previewHeader",
    previewCard: "previewCard",
    deviceFrameWrapper: "deviceFrameWrapper",
    deviceFrame: "deviceFrame",
    frameSizeLabel: "frameSizeLabel",
    codeCard: "codeCard",
    codeHeader: "codeHeader",
    codeBlock: "codeBlock",
    codeBlockPre: "codeBlockPre",
    featuresGrid: "featuresGrid",
    featureCard: "featureCard",
    featureTop: "featureTop",
    featureIconWrapper: "featureIconWrapper",
    featureIcon: "featureIcon",
    featureTitle: "featureTitle",
    featureIconAccent: "featureIconAccent",
    featureIconSuccess: "featureIconSuccess",
    featureIconMixed: "featureIconMixed",
    featureIconColorAccent: "a",
    featureIconColorSuccess: "b",
    featureIconColorMixed: "c",
  },
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children, variant, dismissible, onDismiss }: any) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
      {dismissible && (
        <button onClick={onDismiss} data-testid="alert-dismiss">
          Dismiss
        </button>
      )}
    </div>
  ),
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, variant, size }: any) => (
    <button onClick={onClick} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  Divider: () => <hr data-testid="divider" />,
  SegmentedControl: ({ segments, value, onChange }: any) => (
    <div data-testid="segmented-control">
      {segments?.map((s: any) => (
        <button
          key={s.id}
          data-testid={`segment-${s.id}`}
          data-active={s.id === value}
          onClick={() => onChange?.(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  ),
  Select: ({ options, value, onChange, label }: any) => (
    <select
      data-testid={`select-${label}`}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

/* ── Clipboard mock ────────────────────────────, @eslint-react/no-array-index-key */

const writeText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText } });

/* ── Test data ─────────────────────────────────, @eslint-react/no-array-index-key */

const venuesResponse = {
  data: [
    {
      id: "v-1",
      name: "Downtown Grill",
      settings: { maxPartySize: 10 },
    },
    {
      id: "v-2",
      name: "Uptown Bistro",
      settings: { maxPartySize: 6 },
    },
  ],
};

describe("BookingWidgetDemoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok-123" } as any);
    mockVenuesList.mockResolvedValue(venuesResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading skeleton initially", () => {
    mockVenuesList.mockReturnValue(new Promise(() => {}));
    render(<BookingWidgetDemoPage />);

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.getByTestId("skeleton-group")).toBeDefined();
  });

  it("shows venue selector with options after loading", async () => {
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      const select = screen.getByTestId("select-Venue");
      expect(select).toBeDefined();
    });

    const options = screen.getByTestId("select-Venue").querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe("Downtown Grill");
    expect(options[1].textContent).toBe("Uptown Bistro");
  });

  it("shows info alert when no venues found", async () => {
    mockVenuesList.mockResolvedValue({ data: [] });
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      const alerts = screen.getAllByTestId("alert");
      const noVenuesAlert = alerts.find((a) => a.textContent?.includes("No venues found"));
      expect(noVenuesAlert).toBeDefined();
      expect(noVenuesAlert!.getAttribute("data-variant")).toBe("info");
    });
  });

  it("renders device frame switcher with 3 segments", async () => {
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      expect(screen.getByTestId("segmented-control")).toBeDefined();
    });

    expect(screen.getByTestId("segment-desktop")).toBeDefined();
    expect(screen.getByTestId("segment-tablet")).toBeDefined();
    expect(screen.getByTestId("segment-mobile")).toBeDefined();
  });

  it("shows error alert that is dismissible", async () => {
    mockVenuesList.mockRejectedValue(new Error("Network failure"));
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      const alerts = screen.getAllByTestId("alert");
      const errorAlert = alerts.find((a) => a.getAttribute("data-variant") === "error");
      expect(errorAlert).toBeDefined();
      expect(errorAlert!.textContent).toContain("Network failure");
    });

    fireEvent.click(screen.getByTestId("alert-dismiss"));

    await waitFor(() => {
      const remaining = screen.getAllByTestId("alert");
      const errorAlert = remaining.find((a) => a.getAttribute("data-variant") === "error");
      expect(errorAlert).toBeUndefined();
    });
  });

  it("copies embed code to clipboard on Copy click", async () => {
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const calledWith = writeText.mock.calls[0][0] as string;
    expect(calledWith).toContain("venueId:");
    expect(calledWith).toContain("BookingWidget.init");
  });

  it("shows Copied! feedback for 2 seconds then reverts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
    });

    expect(screen.getByText("Copied!")).toBeDefined();
    expect(screen.queryByText("Copy")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Copy")).toBeDefined();
    expect(screen.queryByText("Copied!")).toBeNull();
  });

  it("renders 3 feature cards", async () => {
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Real-time Availability")).toBeDefined();
    });

    expect(screen.getByText("10-Minute Hold")).toBeDefined();
    expect(screen.getByText("Instant Confirmation")).toBeDefined();
  });

  it("renders BookingWidget with selected venue ID", async () => {
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      const widget = screen.getByTestId("booking-widget");
      expect(widget).toBeDefined();
      expect(widget.textContent).toBe("v-1");
    });
  });

  it("embed code contains the selected venue ID", async () => {
    render(<BookingWidgetDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
    });

    const calledWith = writeText.mock.calls[0][0] as string;
    expect(calledWith).toContain("v-1");
  });
});
