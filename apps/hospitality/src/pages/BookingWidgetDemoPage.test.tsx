/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BookingWidgetDemoPage } from "./BookingWidgetDemoPage.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockApiClient = {
  venues: {
    list: vi.fn(),
    getBySlug: vi.fn(),
  },
};

const mockNavigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => mockApiClient),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <div data-testid="error-retry-banner">
      <span>{error}</span>
      <button data-testid="retry-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}));

// Captures the last onSetHours callback the page passed down, so tests can
// invoke it directly without rendering extra interactive markup that would
// change the mocked widget's textContent assertions below.
let lastOnSetHours: (() => void) | undefined;

// Imports the real (pure, separately unit-tested) hasOperatingHours module
// directly so its wiring here is genuinely exercised, without pulling in the
// rest of the heavy booking-widget barrel (Stripe, GuestDetailsForm, etc.).
vi.mock("../components/booking-widget", async () => {
  const { hasOperatingHours } = await import("../components/booking-widget/hasOperatingHours.js");
  return {
    BookingWidget: ({ venueId, audience, hasOperatingHours: hasHours, onSetHours }: any) => {
      lastOnSetHours = onSetHours;
      return (
        <div
          data-testid="booking-widget"
          data-audience={audience}
          data-has-operating-hours={String(hasHours)}
        >
          {venueId}
        </div>
      );
    },
    hasOperatingHours,
  };
});
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
  Banner: ({
    children,
    variant,
    action,
  }: {
    children: React.ReactNode;
    variant?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="banner" data-variant={variant}>
      {children}
      {action}
    </div>
  ),
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
  return render(
    <Wrapper>
      <BookingWidgetDemoPage />
    </Wrapper>
  );
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

  it("shows ErrorRetryBanner when fetch fails", async () => {
    mockApiClient.venues.list.mockRejectedValue(new Error("Network failure"));
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("error-retry-banner")).toBeDefined();
    });
    expect(screen.getByText("Network failure")).toBeDefined();
  });

  it("retries venue fetch when retry button is clicked", async () => {
    mockApiClient.venues.list
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValue({ data: mockVenues });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("error-retry-banner")).toBeDefined();
    });

    screen.getByTestId("retry-button").click();

    await waitFor(() => {
      expect(screen.queryByTestId("error-retry-banner")).toBeNull();
      expect(screen.getByTestId("select-Venue")).toBeDefined();
    });
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

  it("renders BookingWidget with the staff audience", async () => {
    renderPage();

    await waitFor(() => {
      const widget = screen.getByTestId("booking-widget");
      expect(widget.getAttribute("data-audience")).toBe("staff");
    });
  });

  it("passes hasOperatingHours=false when the selected venue has no hours configured", async () => {
    // mockVenues entries carry no operatingHours field — matches an
    // unconfigured venue.
    renderPage();

    await waitFor(() => {
      const widget = screen.getByTestId("booking-widget");
      expect(widget.getAttribute("data-has-operating-hours")).toBe("false");
    });
  });

  it("passes hasOperatingHours=true once the selected venue has hours configured", async () => {
    mockApiClient.venues.list.mockResolvedValue({
      data: [
        {
          ...mockVenues[0],
          operatingHours: { monday: { open: "09:00", close: "22:00" } },
        },
      ],
    });
    renderPage();

    await waitFor(() => {
      const widget = screen.getByTestId("booking-widget");
      expect(widget.getAttribute("data-has-operating-hours")).toBe("true");
    });
  });

  it("navigates to /setup/hours when the widget's set-hours prompt is triggered", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("booking-widget")).toBeDefined();
    });

    lastOnSetHours?.();
    expect(mockNavigate).toHaveBeenCalledWith("/setup/hours");
  });

  it("embed code example contains the selected venue ID", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
    });

    expect(document.body.textContent).toContain("v-1");
  });

  it("embed code section shows a coming soon indicator", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
    });

    expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
  });

  it("embed code section does not reference widget.js", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
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

  it("shows a prominent preview banner labeling the page as coming soon", async () => {
    renderPage();

    const banner = await screen.findByTestId("banner");
    expect(banner).toBeDefined();
    expect(banner.getAttribute("data-variant")).toBe("accent");
    expect(banner.textContent).toMatch(/preview only/i);
    expect(banner.textContent).toMatch(/not live yet/i);
  });

  it("labels the preview and embed sections with a coming soon badge", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
    });

    const comingSoonBadges = screen.getAllByText("Coming soon");
    expect(comingSoonBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("embed section no longer presents as ready-to-use", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("embed-coming-soon")).toBeDefined();
    });

    expect(screen.queryByText("Copy")).toBeNull();
    expect(screen.queryByText("Copied!")).toBeNull();
    expect(screen.getAllByText(/not functional yet/i).length).toBeGreaterThan(0);
  });
});
