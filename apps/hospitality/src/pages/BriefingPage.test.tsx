import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type * as ReactRouter from "react-router";
import { ApiClientError } from "@mbe/api-client";
import { BriefingPage, segmentForHour } from "./BriefingPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useBriefing } from "../hooks/useBriefing.js";
import { ERROR_COPY } from "../lib/describe-api-error.js";
import React from "react";

// Pin the wall clock west of Greenwich: every evening booking here has already rolled to
// tomorrow in UTC (17:00 Pacific = 00:00Z), the exact case audit A2 measured.
process.env.TZ = "America/Los_Angeles";

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useBriefing.js", () => ({ useBriefing: vi.fn() }));
vi.mock("../hooks/useSSESync.tsx", () => ({
  useSSEEventFeed: vi.fn(() => []),
  useSSEStatus: vi.fn(() => ({ isConnected: false, error: null })),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({
    title,
    error,
    details,
    onRetry,
  }: {
    title?: string;
    error: string;
    details?: string;
    onRetry?: () => void;
  }) => (
    <div role="alert" data-testid="error-banner">
      {title && <p data-testid="banner-title">{title}</p>}
      <p data-testid="banner-detail">{error}</p>
      {details && <div data-testid="banner-details">{details}</div>}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
  }) => <span data-testid={`badge-${variant ?? "default"}`}>{children}</span>,
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  EmptyState: ({
    heading,
    description,
    action,
    size,
    variant,
  }: {
    heading: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    size?: string;
    variant?: string;
  }) => (
    <div data-testid="empty-state" data-size={size} data-variant={variant}>
      <span>{heading}</span>
      <span>{description}</span>
      {action}
    </div>
  ),
  Input: (props: {
    type?: string;
    placeholder?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    "aria-label"?: string;
  }) => (
    <input
      data-testid={props.type === "date" ? "date-input" : "search-input"}
      type={props.type}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
      aria-label={props["aria-label"]}
    />
  ),
  SegmentedControl: ({
    segments,
    value: _value,
    onChange,
  }: {
    segments?: Array<{ id: string; label: string }>;
    value?: string;
    onChange?: (id: string) => void;
  }) => (
    <div data-testid="segmented-control">
      {segments?.map((s) => (
        <button key={s.id} data-testid={`segment-${s.id}`} onClick={() => onChange?.(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tag: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="tag" data-variant={variant ?? "default"}>
      {children}
    </span>
  ),
  Text: ({
    children,
    className,
    as: _as,
  }: {
    children: React.ReactNode;
    className?: string;
    as?: string;
  }) => <span className={className}>{children}</span>,
}));

const mockVenue: VenueContextValue = {
  selectedVenueId: "venue-abc",
  setSelectedVenueId: vi.fn(),
  venues: [],
  isLoading: false,
};

/** Service night under test: Friday 2026-09-04, clock at 20:00 local. */
const TODAY = "2026-09-04";
const NOW_LOCAL = new Date(`${TODAY}T20:00:00`);

/** A local wall-clock time on TODAY as the ISO instant the API would send. */
const atLocal = (hhmm: string) => new Date(`${TODAY}T${hhmm}:00`).toISOString();

const makeEntry = (overrides = {}) => ({
  id: "res-1",
  date: TODAY,
  startTime: atLocal("18:00"),
  endTime: atLocal("20:00"),
  partySize: 4,
  status: "CONFIRMED" as const,
  notes: "Window table please",
  cancellationReason: null,
  cancellationNote: null,
  guestName: "Jane Doe",
  guestId: "guest-1",
  userId: null,
  occasion: null,
  seatingPreference: null,
  tableId: "table-1",
  table: { id: "table-1", name: "Table 5", tableNumber: "5" },
  venueId: "venue-abc",
  createdAt: atLocal("00:00"),
  updatedAt: atLocal("00:00"),
  guest: {
    id: "guest-1",
    name: "Jane Doe",
    visitCount: 3,
    lastVisit: "2026-06-01",
    dietaryRestrictions: ["gluten-free"],
    notes: "Regular",
    staffNotes: [],
    tags: ["VIP"],
    communicationPreference: "email_only",
  },
  ...overrides,
});

type BriefingResult = ReturnType<typeof useBriefing>;

function mockBriefing(overrides: Partial<BriefingResult> = {}): BriefingResult {
  const result: BriefingResult = {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  vi.mocked(useBriefing).mockReturnValue(result);
  return result;
}

function serverError(): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    "GET",
    "/api/v1/briefing"
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BriefingPage />
    </MemoryRouter>
  );
}

describe("segmentForHour", () => {
  it.each([
    [0, "early"],
    [17, "early"],
    [18, "dinner"],
    [20, "dinner"],
    [21, "late"],
    [23, "late"],
  ] as const)("hour %i → %s", (hour, segment) => {
    expect(segmentForHour(hour)).toBe(segment);
  });
});

describe("BriefingPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_LOCAL);
    vi.mocked(useVenue).mockReturnValue(mockVenue);
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loading", () => {
    it("shows three card skeletons inside an aria-busy status region with one spoken sentence", () => {
      mockBriefing({ data: undefined, isLoading: true });

      renderPage();

      const busy = screen
        .getAllByRole("status")
        .find((el) => el.getAttribute("aria-busy") === "true");
      expect(busy).toBeDefined();
      expect(busy).toHaveTextContent("Loading tonight's briefing…");
      expect(within(busy!).getAllByTestId("skeleton")).toHaveLength(3);
      expect(screen.getByTestId("skeleton-group")).toBeInTheDocument();
    });
  });

  it("renders page title in header", () => {
    mockBriefing();

    renderPage();
    expect(screen.getByTestId("page-header")).toHaveTextContent("Tonight's Service");
  });

  it("exposes an accessible name for the service date input", () => {
    mockBriefing();

    renderPage();
    expect(screen.getByLabelText("Service date")).toBeInTheDocument();
  });

  describe("empty states (ux.md Screen 1)", () => {
    it("whole day: names the date, points at the Timeline, and offers Open Timeline", () => {
      mockBriefing({ data: [] });

      renderPage();

      const empty = screen.getByTestId("empty-state");
      expect(empty).toHaveAttribute("data-variant", "flat");
      expect(empty).toHaveTextContent("Nothing on the book for Friday, Sep 4.");
      expect(empty).toHaveTextContent("Change the date, or seat walk-ins from the Timeline.");
      const open = within(empty).getByRole("button", { name: "Open Timeline" });
      expect(open).toHaveAttribute("data-variant", "secondary");
      fireEvent.click(open);
      expect(mockNavigate).toHaveBeenCalledWith("/timeline");
    });

    it("one segment: a small flat empty state named for that segment", () => {
      mockBriefing({ data: [makeEntry({ startTime: atLocal("18:30") })] });

      renderPage();
      fireEvent.click(screen.getByTestId("segment-late"));

      const empty = screen.getByTestId("empty-state");
      expect(empty).toHaveAttribute("data-size", "sm");
      expect(empty).toHaveAttribute("data-variant", "flat");
      expect(empty).toHaveTextContent("No late seatings tonight.");
      expect(within(empty).queryByRole("button")).toBeNull();

      fireEvent.click(screen.getByTestId("segment-early"));
      expect(screen.getByTestId("empty-state")).toHaveTextContent("No early seatings tonight.");
    });

    it("does not wrap the empty state in its own live region (one region per page)", () => {
      mockBriefing({ data: [] });

      renderPage();

      const empty = screen.getByTestId("empty-state");
      expect(empty.closest("[aria-live]")).toBeNull();
    });
  });

  describe("cards", () => {
    it("renders reservation cards with guest info", () => {
      mockBriefing({ data: [makeEntry()] });

      renderPage();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("4 covers")).toBeInTheDocument(); // party size badge
    });

    it("shows visit count when available", () => {
      mockBriefing({ data: [makeEntry()] });

      renderPage();
      expect(screen.getByText(/3rd visit/i)).toBeInTheDocument();
    });

    it("renders the VIP segment badge from guest.tags (A10.1)", () => {
      mockBriefing({ data: [makeEntry({ guest: { ...makeEntry().guest, tags: ["VIP"] } })] });

      renderPage();

      expect(screen.getByTestId("badge-accent")).toHaveTextContent("VIP");
    });

    it("renders Repeat / New from the visit count when no vip tag", () => {
      mockBriefing({
        data: [
          makeEntry({ id: "r1", guest: { ...makeEntry().guest, tags: [], visitCount: 3 } }),
          makeEntry({
            id: "r2",
            guestName: "First Timer",
            guest: { ...makeEntry().guest, tags: null, visitCount: 1 },
          }),
        ],
      });

      renderPage();

      expect(screen.getByTestId("badge-success")).toHaveTextContent("Repeat");
      expect(screen.getAllByTestId("badge-neutral").map((b) => b.textContent)).toContain("New");
    });

    it("hides other guest.tags — only the segment badge speaks for them", () => {
      mockBriefing({
        data: [makeEntry({ guest: { ...makeEntry().guest, tags: ["VIP", "wine-club"] } })],
      });

      renderPage();

      expect(screen.queryByText("wine-club")).toBeNull();
    });

    it("tags dietary restrictions per tag: allergy → error prefixed 'Allergy:', else default (A10.2)", () => {
      mockBriefing({
        data: [
          makeEntry({
            guest: { ...makeEntry().guest, dietaryRestrictions: ["nut allergy", "vegetarian"] },
          }),
        ],
      });

      renderPage();

      const tags = screen.getAllByTestId("tag");
      expect(tags).toHaveLength(2);
      const errorTags = tags.filter((t) => t.getAttribute("data-variant") === "error");
      const defaultTags = tags.filter((t) => t.getAttribute("data-variant") === "default");
      expect(errorTags).toHaveLength(1);
      expect(errorTags[0]).toHaveTextContent("Allergy: nut allergy");
      expect(defaultTags).toHaveLength(1);
      expect(defaultTags[0]).toHaveTextContent("vegetarian");
      expect(screen.queryByText("nut allergy")).toBeNull();
    });

    it("prints the time with the shared formatter — no leading zero (A10.3)", () => {
      mockBriefing({ data: [makeEntry({ startTime: atLocal("17:30") })] });

      renderPage();

      expect(screen.getByText("5:30 PM")).toBeInTheDocument();
      expect(screen.queryByText("05:30 PM")).toBeNull();
    });
  });

  describe("segments bucket on the local hour (A2)", () => {
    const night = () => [
      makeEntry({ id: "early", guestName: "Early Guest", startTime: atLocal("17:30") }),
      makeEntry({ id: "dinner", guestName: "Dinner Guest", startTime: atLocal("18:30") }),
      makeEntry({ id: "late", guestName: "Late Guest", startTime: atLocal("21:00") }),
    ];

    it("the fixture really is past the UTC rollover (17:30 Pacific is tomorrow in UTC)", () => {
      const startTime = atLocal("17:30");
      expect(new Date(startTime).getUTCDate()).toBe(new Date(NOW_LOCAL).getDate() + 1);
      expect(new Date(startTime).getUTCHours()).toBe(0);
    });

    it("All shows every party with its printed local time", () => {
      mockBriefing({ data: night() });

      renderPage();

      expect(screen.getByText("5:30 PM")).toBeInTheDocument();
      expect(screen.getByText("6:30 PM")).toBeInTheDocument();
      expect(screen.getByText("9:00 PM")).toBeInTheDocument();
    });

    it.each([
      ["early", "Early Guest", "5:30 PM"],
      ["dinner", "Dinner Guest", "6:30 PM"],
      ["late", "Late Guest", "9:00 PM"],
    ])("%s segment files exactly the %s (%s)", (segment, guest, time) => {
      mockBriefing({ data: night() });

      renderPage();
      fireEvent.click(screen.getByTestId(`segment-${segment}`));

      expect(screen.getAllByTestId("card")).toHaveLength(1);
      expect(screen.getByText(guest)).toBeInTheDocument();
      expect(screen.getByText(time)).toBeInTheDocument();
    });
  });

  describe("error (B1)", () => {
    it("500 → one alert with the surface title and the serverError sentence; the request line is demoted to details", () => {
      const error = serverError();
      mockBriefing({ data: undefined, error });

      renderPage();

      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(screen.getByTestId("banner-title")).toHaveTextContent(
        "Couldn't load tonight's briefing."
      );
      expect(screen.getByTestId("banner-detail")).toHaveTextContent(ERROR_COPY.serverError.detail);
      expect(screen.getByTestId("banner-detail")).not.toHaveTextContent(error.message);
      expect(screen.getByTestId("banner-details")).toHaveTextContent(error.message);
      // Segments stay operable beside the banner.
      expect(screen.getByTestId("segmented-control")).toBeInTheDocument();
      expect(screen.queryByTestId("empty-state")).toBeNull();
    });

    it("Retry calls useBriefing's refetch and, once it resolves, speaks one sentence", async () => {
      const failed = mockBriefing({ data: undefined, error: serverError() });

      const view = renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(failed.refetch).toHaveBeenCalledTimes(1);

      // The query recovers: rerender with data, then let the refetch promise settle.
      mockBriefing({ data: [makeEntry()], refetch: failed.refetch });
      await act(async () => {
        view.rerender(
          <MemoryRouter>
            <BriefingPage />
          </MemoryRouter>
        );
      });

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      const spoken = screen.getAllByRole("status").find((el) => el.getAttribute("aria-live"));
      expect(spoken).toHaveTextContent("Briefing for Friday, Sep 4 loaded.");
    });

    it("stays silent when the retry fails again", async () => {
      const failed = mockBriefing({
        data: undefined,
        error: serverError(),
        refetch: vi.fn().mockResolvedValue({ error: serverError() }),
      });

      renderPage();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      });

      expect(failed.refetch).toHaveBeenCalledTimes(1);
      const spoken = screen.getAllByRole("status").find((el) => el.getAttribute("aria-live"));
      expect(spoken?.textContent).toBe("");
    });
  });
});
