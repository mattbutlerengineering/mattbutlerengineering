/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { BookingWidgetDemoPage } from "./BookingWidgetDemoPage.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockApiClient = {
  venues: {
    list: vi.fn(),
    getBySlug: vi.fn(),
  },
};

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => mockApiClient),
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
  Alert: ({ children, variant }: any) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
    </div>
  ),
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, variant, size }: any) => (
    <button onClick={onClick} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
  Card: ({ children, "data-testid": dataTestId, ...rest }: any) => (
    <div data-testid={dataTestId ?? "card"} {...rest}>
      {children}
    </div>
  ),
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

/* ── Clipboard mock ─────────────────────────── */

const writeText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText } });

/* ── Test data ──────────────────────────────── */

const mockVenues = [
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
];

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
  return render(<Wrapper><BookingWidgetDemoPage /></Wrapper>);
}

describe("BookingWidgetDemoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.venues.list.mockResolvedValue({ data: mockVenues });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading skeleton initially", () => {
    mockApiClient.venues.list.mockReturnValue(new Promise(() => {}));
    renderPage();

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.getByTestId("skeleton-group")).toBeDefined();
  });

  it("shows venue selector with options after loading", async () => {
    renderPage();

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
    mockApiClient.venues.list.mockResolvedValue({ data: [] });
    renderPage();

    await waitFor(() => {
      const alerts = screen.getAllByTestId("alert");
      const noVenuesAlert = alerts.find((a) => a.textContent?.includes("No venues found"));
      expect(noVenuesAlert).toBeDefined();
      expect(noVenuesAlert!.getAttribute("data-variant")).toBe("info");
    });
  });

  it("renders device frame switcher with 3 segments", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("segmented-control")).toBeDefined();
    });

    expect(screen.getByTestId("segment-desktop")).toBeDefined();
    expect(screen.getByTestId("segment-tablet")).toBeDefined();
    expect(screen.getByTestId("segment-mobile")).toBeDefined();
  });

  it("shows error alert when fetch fails", async () => {
    mockApiClient.venues.list.mockRejectedValue(new Error("Network failure"));
    renderPage();

    await waitFor(() => {
      const alerts = screen.getAllByTestId("alert");
      const errorAlert = alerts.find((a) => a.getAttribute("data-variant") === "error");
      expect(errorAlert).toBeDefined();
      expect(errorAlert!.textContent).toContain("Network failure");
    });
  });

  it("copies embed code to clipboard on Copy click", async () => {
    renderPage();

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
    renderPage();

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
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Real-time Availability")).toBeDefined();
    });

    expect(screen.getByText("10-Minute Hold")).toBeDefined();
    expect(screen.getByText("Instant Confirmation")).toBeDefined();
  });

  it("renders BookingWidget with selected venue ID", async () => {
    renderPage();

    await waitFor(() => {
      const widget = screen.getByTestId("booking-widget");
      expect(widget).toBeDefined();
      expect(widget.textContent).toBe("v-1");
    });
  });

  it("embed code contains the selected venue ID", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
    });

    const calledWith = writeText.mock.calls[0][0] as string;
    expect(calledWith).toContain("v-1");
  });

  it("embed code section shows a coming soon indicator", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
    });

    expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
  });

  it("embed code section does not reference widget.js", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
    });

    expect(document.body.innerHTML).not.toContain("widget.js");
  });

  it("page renders correctly with coming soon section visible", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
    });

    expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
    const comingSoonTexts = screen.getAllByText(/embeddable widget/i);
    expect(comingSoonTexts.length).toBeGreaterThan(0);
  });
});
