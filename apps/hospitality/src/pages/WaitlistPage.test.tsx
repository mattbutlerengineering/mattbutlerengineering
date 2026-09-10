import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { WaitlistPage } from "./WaitlistPage.js";
import { ApiClientError } from "@mbe/api-client";
import { ERROR_COPY } from "../lib/describe-api-error.js";
import { localDateString } from "../utils/local-clock.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import {
  useWaitlist,
  useCreateWaitlistEntry,
  useNotifyWaitlistEntry,
  useCancelWaitlistEntry,
  useSeatWaitlistEntry,
} from "../hooks/useWaitlist.js";
import { useTables } from "../hooks/useTables.js";
import { useApiClient } from "../hooks/useApiClient.js";
import type { Table, WaitlistEntry } from "@mbe/types";
import React from "react";

vi.mock("react-router", async () => ({
  ...(await vi.importActual("react-router")),
  useNavigate: vi.fn(),
}));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useWaitlist.js", () => ({
  useWaitlist: vi.fn(),
  useCreateWaitlistEntry: vi.fn(),
  useNotifyWaitlistEntry: vi.fn(),
  useCancelWaitlistEntry: vi.fn(),
  useSeatWaitlistEntry: vi.fn(),
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: vi.fn() }));
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: vi.fn() }));

vi.mock("../components/PageHeader", () => ({
  // tabIndex={-1} like the real one: useFocusAfter's pageHeading target lands here.
  PageHeader: ({ title }: { title: string }) => (
    <h1 tabIndex={-1} data-testid="page-header">
      {title}
    </h1>
  ),
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
    <div role="alert" data-testid="error-banner" data-details={details}>
      {title && <strong>{title}</strong>}
      <span>{error}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

const mockToast = vi.fn();
const mockNavigate = vi.fn();

/** A 500 the way `@mbe/api-client` raises it: `raw` is "<METHOD> <path> failed: 500 …". */
function serverError(method: string, path: string): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    method,
    path
  );
}

vi.mock("@mattbutlerengineering/rialto", async () => {
  const { forwardRef } = await vi.importActual<typeof React>("react");

  return {
    Alert: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="alert">{children}</div>
    ),
    Badge: ({ children }: { children: React.ReactNode }) => (
      <span data-testid="badge">{children}</span>
    ),
    Button: ({
      children,
      isLoading,
      loadingText,
      ...props
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      loadingText?: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{isLoading ? (loadingText ?? children) : children}</button>
    ),
    // Forwards tabIndex / data-testid: entry cards are useFocusAfter targets.
    Card: ({
      children,
      ...props
    }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
      <div data-card="" {...props}>
        {children}
      </div>
    ),
    EmptyState: ({
      heading,
      description,
      action,
    }: {
      heading: React.ReactNode;
      description?: React.ReactNode;
      action?: React.ReactNode;
    }) => (
      <div data-testid="empty-state">
        <span>{heading}</span>
        <span>{description}</span>
        {action}
      </div>
    ),
    Input: forwardRef<
      HTMLInputElement,
      { label?: string } & React.InputHTMLAttributes<HTMLInputElement>
    >(({ label, ...props }, ref) => (
      <label>
        {label}
        <input ref={ref} {...props} />
      </label>
    )),
    Select: ({
      label,
      value,
      onChange,
      options,
      disabled,
    }: {
      label?: string;
      value?: string;
      onChange?: (value: string) => void;
      options: { value: string; label: string }[];
      disabled?: boolean;
    }) => (
      <label>
        {label}
        <select value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    ),
    Skeleton: () => <div data-testid="skeleton" />,
    SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="skeleton-group">{children}</div>
    ),
    Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Text: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <span className={className}>{children}</span>
    ),
    useToast: () => ({ toast: mockToast, dismiss: vi.fn() }),
  };
});

const mockVenue: VenueContextValue = {
  selectedVenueId: "venue-abc",
  setSelectedVenueId: vi.fn(),
  venues: [],
  isLoading: false,
};

const makeEntry = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  id: "wl-1",
  venueId: "venue-abc",
  partySize: 4,
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  position: 1,
  estimatedWaitMinutes: 15,
  status: "waiting",
  notifiedAt: null,
  expiresAt: null,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <WaitlistPage />
    </MemoryRouter>
  );
}

/** Scopes card queries to waitlist entry rows, excluding the add-to-waitlist form's own Card. */
function getRowCards(container: HTMLElement) {
  const cardsList = container.querySelector(".cards");
  if (!cardsList) return [];
  return Array.from(cardsList.querySelectorAll<HTMLElement>("[data-card]"));
}

const makeTable = (overrides: Partial<Table> = {}): Table => ({
  id: "table-1",
  name: "Table 1",
  capacity: 4,
  isActive: true,
  status: "AVAILABLE",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  shape: "RECTANGLE",
  rotation: 0,
  venueId: "venue-abc",
  floorPlanId: "fp-1",
  ...overrides,
});

function mockMutationHooks(
  overrides: {
    create?: Partial<ReturnType<typeof useCreateWaitlistEntry>>;
    notify?: Partial<ReturnType<typeof useNotifyWaitlistEntry>>;
    cancel?: Partial<ReturnType<typeof useCancelWaitlistEntry>>;
    seat?: Partial<ReturnType<typeof useSeatWaitlistEntry>>;
  } = {}
) {
  vi.mocked(useCreateWaitlistEntry).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(makeEntry()),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides.create,
  });
  vi.mocked(useNotifyWaitlistEntry).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(makeEntry()),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides.notify,
  });
  vi.mocked(useCancelWaitlistEntry).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(makeEntry()),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides.cancel,
  });
  vi.mocked(useSeatWaitlistEntry).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(makeEntry({ status: "seated" })),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides.seat,
  });
}

describe("WaitlistPage", () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockNavigate.mockClear();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useVenue).mockReturnValue(mockVenue);
    vi.mocked(useTables).mockReturnValue({
      data: [makeTable()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(useApiClient).mockReturnValue({
      reservations: { walkIn: vi.fn().mockResolvedValue({ id: "res-1" }) },
    } as unknown as ReturnType<typeof useApiClient>);
    mockMutationHooks();
  });

  describe("venue scoping of the tables query", () => {
    // GET /api/v1/tables is venue-scoped (#4873): requireVenueAccess resolves
    // the venue to check membership against from ?venueId, so firing the query
    // with the empty placeholder before the venue list resolves is a
    // guaranteed 403 for any non-admin operator, not an empty result.
    it("does not request tables until a venue is selected", () => {
      vi.mocked(useVenue).mockReturnValue({ ...mockVenue, selectedVenueId: null });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();

      expect(useTables).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: undefined, enabled: false })
      );
    });

    it("requests tables for the selected venue once one is available", () => {
      vi.mocked(useWaitlist).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();

      expect(useTables).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-abc", enabled: true })
      );
    });
  });

  it("shows loading state", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("skeleton-group")).toBeInTheDocument();
  });

  it("renders page title in header", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("page-header")).toHaveTextContent("Waitlist");
  });

  it("shows empty state when no one is waiting", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No one waiting");
  });

  it("offers an action inside the empty state that focuses the add-to-waitlist form", () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(useWaitlist).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    const empty = screen.getByTestId("empty-state");
    const actionButton = within(empty).getByRole("button");
    fireEvent.click(actionButton);

    expect(screen.getByLabelText(/guest name/i)).toHaveFocus();
  });

  it('a load failure shows "Couldn\'t load the waitlist." with the house sentence and a Retry — never the request line', () => {
    const refetch = vi.fn();
    vi.mocked(useWaitlist).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: serverError("GET", "/api/v1/waitlist?venueId=venue-abc"),
      refetch,
    });

    renderPage();
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Couldn't load the waitlist.");
    expect(banner).toHaveTextContent(ERROR_COPY.serverError.detail);
    expect(screen.queryByText(/failed: 500/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("mounts one empty polite status region from the first render (S12)", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: [makeEntry()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("renders entries ordered by position with guest name, party size and wait", () => {
    const first = makeEntry({ id: "wl-1", position: 1, guestName: "Alice", partySize: 2 });
    const second = makeEntry({
      id: "wl-2",
      position: 2,
      guestName: "Bob",
      partySize: 5,
      estimatedWaitMinutes: 30,
    });
    // Return out of order — page must sort by position, not array order.
    vi.mocked(useWaitlist).mockReturnValue({
      data: [second, first],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = renderPage();

    const names = getRowCards(container).map((card) => card.textContent);
    expect(names[0]).toContain("Alice");
    expect(names[1]).toContain("Bob");
    expect(screen.getByText("Party of 2")).toBeInTheDocument();
    expect(screen.getByText("Party of 5")).toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });

  describe("add to waitlist form", () => {
    beforeEach(() => {
      vi.mocked(useWaitlist).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    function fillForm({ name = "Smith", phone = "555-123-4567" } = {}) {
      fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: name } });
      fireEvent.change(screen.getByLabelText(/guest phone/i), { target: { value: phone } });
    }

    it("calls api.waitlist.create with trimmed guest details and current party size on submit", async () => {
      const mutateAsync = vi.fn().mockResolvedValue(makeEntry());
      mockMutationHooks({ create: { mutateAsync } });
      renderPage();

      fillForm({ name: "  Smith  ", phone: " 555-123-4567 " });
      fireEvent.click(screen.getByRole("button", { name: "6" }));
      fireEvent.click(screen.getByRole("button", { name: "Add to Waitlist" }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          venueId: "venue-abc",
          partySize: 6,
          guestName: "Smith",
          guestPhone: "555-123-4567",
        });
      });
    });

    it("rejects an invalid phone number client-side without calling create", async () => {
      const mutateAsync = vi.fn().mockResolvedValue(makeEntry());
      mockMutationHooks({ create: { mutateAsync } });
      renderPage();

      fillForm({ phone: "123" });
      fireEvent.click(screen.getByRole("button", { name: "Add to Waitlist" }));

      await waitFor(() => {
        expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();
      });
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("requires a guest name", async () => {
      const mutateAsync = vi.fn().mockResolvedValue(makeEntry());
      mockMutationHooks({ create: { mutateAsync } });
      renderPage();

      fireEvent.change(screen.getByLabelText(/guest phone/i), {
        target: { value: "555-123-4567" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add to Waitlist" }));

      await waitFor(() => {
        expect(screen.getByText(/guest name is required/i)).toBeInTheDocument();
      });
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('a 500 on add shows "Not added." with the house sentence, never the request line (B1.1)', async () => {
      const mutateAsync = vi.fn().mockRejectedValue(serverError("POST", "/api/v1/waitlist"));
      mockMutationHooks({ create: { mutateAsync } });
      renderPage();

      fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Add to Waitlist" }));

      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("Not added.");
      expect(banner).toHaveTextContent(ERROR_COPY.serverError.detail);
      expect(screen.queryByText(/failed: 500/)).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("");
    });

    it("announces the add once and returns focus to the Guest Name field (B3.1, B3.2 — the deliberate exception)", async () => {
      const mutateAsync = vi
        .fn()
        .mockResolvedValue(makeEntry({ id: "wl-9", guestName: "Jordan Lee", partySize: 3 }));
      mockMutationHooks({ create: { mutateAsync } });
      renderPage();

      fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Add to Waitlist" }));

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(
          /^Added Jordan Lee, party of 3, to the waitlist\.$/
        );
      });
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(document.activeElement).toBe(screen.getByLabelText("Guest Name"));
    });
  });

  describe("row actions", () => {
    it("calls api.waitlist.notify with the entry id when Notify is clicked", async () => {
      const notifyMutateAsync = vi.fn().mockResolvedValue(makeEntry());
      mockMutationHooks({ notify: { mutateAsync: notifyMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Notify" }));

      await waitFor(() => {
        expect(notifyMutateAsync).toHaveBeenCalledWith("wl-1");
      });
    });

    it("shows a Notified badge and hides the Notify button once notifiedAt is set", () => {
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", notifiedAt: "2026-01-15T00:05:00.000Z" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = renderPage();

      const [card] = getRowCards(container);
      expect(within(card!).getByText("Notified")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Notify" })).not.toBeInTheDocument();
    });

    it("calls api.waitlist.cancel with the entry id when Cancel is clicked", async () => {
      const cancelMutateAsync = vi.fn().mockResolvedValue(makeEntry());
      mockMutationHooks({ cancel: { mutateAsync: cancelMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(cancelMutateAsync).toHaveBeenCalledWith("wl-1");
      });
    });

    it('a 500 on notify shows "Not notified." in the row with the house sentence, never the request line', async () => {
      const notifyMutateAsync = vi
        .fn()
        .mockRejectedValue(serverError("PUT", "/api/v1/waitlist/wl-1/notify"));
      mockMutationHooks({ notify: { mutateAsync: notifyMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Notify" }));

      const banner = await screen.findByRole("alert");
      expect(getRowCards(container)[0]).toContainElement(banner);
      expect(banner).toHaveTextContent("Not notified.");
      expect(banner).toHaveTextContent(ERROR_COPY.serverError.detail);
      expect(screen.queryByText(/failed: 500/)).toBeNull();
    });

    it('a 500 on cancel shows "Not removed." with the house sentence', async () => {
      const cancelMutateAsync = vi
        .fn()
        .mockRejectedValue(serverError("PUT", "/api/v1/waitlist/wl-1/cancel"));
      mockMutationHooks({ cancel: { mutateAsync: cancelMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("Not removed.");
      expect(banner).toHaveTextContent(ERROR_COPY.serverError.detail);
      expect(screen.queryByText(/failed: 500/)).toBeNull();
    });

    it('notify success speaks "Notified <name>." once; the entry leaves the waiting list (the API lists status "waiting" only), so focus goes to the next entry\'s card', async () => {
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [
          makeEntry({ id: "wl-1", position: 1, guestName: "Jordan Lee" }),
          makeEntry({ id: "wl-2", position: 2, guestName: "Sam Okafor" }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getAllByRole("button", { name: "Notify" })[0]!);

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Notified Jordan Lee\.$/);
      });
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(document.activeElement).toBe(screen.getByTestId("waitlist-entry-wl-2"));
    });

    it('notifying the only entry focuses the "No one waiting" block once the refetch empties the list', async () => {
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", guestName: "Jordan Lee" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const view = renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Notify" }));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Notified Jordan Lee\.$/);
      });

      // The refetch lands: the notified party is no longer "waiting", so the list is empty.
      vi.mocked(useWaitlist).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      view.rerender(
        <MemoryRouter>
          <WaitlistPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId("waitlist-empty"));
      });
      expect(screen.getByTestId("waitlist-empty")).toHaveTextContent("No one waiting");
    });

    it('cancel success speaks "Removed <name> from the waitlist." and focuses the next entry\'s card', async () => {
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [
          makeEntry({ id: "wl-1", position: 1, guestName: "Alice" }),
          makeEntry({ id: "wl-2", position: 2, guestName: "Bob" }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Removed Alice from the waitlist\.$/);
      });
      expect(document.activeElement).toBe(screen.getByTestId("waitlist-entry-wl-2"));
    });

    it('cancelling the last entry focuses the "No one waiting" block once it renders', async () => {
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", guestName: "Alice" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const view = renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Removed Alice/);
      });

      // The refetch lands: the list is empty now.
      vi.mocked(useWaitlist).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      view.rerender(
        <MemoryRouter>
          <WaitlistPage />
        </MemoryRouter>
      );

      const empty = screen.getByTestId("waitlist-empty");
      expect(empty).toHaveTextContent("No one waiting");
      expect(document.activeElement).toBe(empty);
    });

    it("cancelling the final entry of several (no next card) focuses the page heading — rule (d)'s last fallback", async () => {
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [
          makeEntry({ id: "wl-1", position: 1, guestName: "Alice" }),
          makeEntry({ id: "wl-2", position: 2, guestName: "Bob" }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[1]!);

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Removed Bob/);
      });
      expect(document.activeElement).toBe(screen.getByTestId("page-header"));
    });
  });

  describe("seat action", () => {
    it("creates a walk-in reservation then marks the entry seated on success", async () => {
      const walkIn = vi.fn().mockResolvedValue({ id: "res-1" });
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      const seatMutateAsync = vi.fn().mockResolvedValue(makeEntry({ status: "seated" }));
      mockMutationHooks({ seat: { mutateAsync: seatMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", partySize: 4, guestName: "Jane Doe" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Seat" }));

      await waitFor(() => {
        expect(walkIn).toHaveBeenCalledWith(
          expect.objectContaining({
            partySize: 4,
            guestName: "Jane Doe",
            venueId: "venue-abc",
            tableId: "table-1",
          })
        );
      });
      await waitFor(() => {
        expect(seatMutateAsync).toHaveBeenCalledWith("wl-1");
      });
    });

    it('seat success speaks the sentence once, toasts a "View on Timeline" handoff to today\'s Timeline with the party selected, and focuses the next card', async () => {
      const walkIn = vi.fn().mockResolvedValue({ id: "res-77" });
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [
          makeEntry({ id: "wl-1", position: 1, guestName: "Jordan Lee", partySize: 3 }),
          makeEntry({ id: "wl-2", position: 2, guestName: "Bob", partySize: 2 }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getAllByRole("button", { name: "Seat" })[0]!);

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Seated Jordan Lee at Table 1\.$/);
      });
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(document.activeElement).toBe(screen.getByTestId("waitlist-entry-wl-2"));

      expect(mockToast).toHaveBeenCalledTimes(1);
      const toastInput = mockToast.mock.calls[0]![0] as {
        variant: string;
        title: string;
        action: { label: string; onClick: () => void };
      };
      expect(toastInput.variant).toBe("success");
      expect(toastInput.title).toBe("Seated Jordan Lee at Table 1.");
      expect(toastInput.action.label).toBe("View on Timeline");
      toastInput.action.onClick();
      expect(mockNavigate).toHaveBeenCalledWith(
        `/timeline?date=${localDateString(new Date())}&selected=res-77`
      );
    });

    it('seating the only entry focuses the "No one waiting" block once it renders', async () => {
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", guestName: "Jordan Lee" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const view = renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Seat" }));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/^Seated Jordan Lee/);
      });

      vi.mocked(useWaitlist).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      view.rerender(
        <MemoryRouter>
          <WaitlistPage />
        </MemoryRouter>
      );
      expect(document.activeElement).toBe(screen.getByTestId("waitlist-empty"));
    });

    it('on a 409 table-unavailable failure, shows "Not seated." with the server\'s own detail, leaves the entry waiting, and never marks it seated', async () => {
      const walkIn = vi.fn().mockRejectedValue(
        new ApiClientError(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Table is not available",
          },
          "POST",
          "/api/v1/reservations/walk-in"
        )
      );
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      const seatMutateAsync = vi.fn().mockResolvedValue(makeEntry({ status: "seated" }));
      mockMutationHooks({ seat: { mutateAsync: seatMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", partySize: 4, guestName: "Jane Doe" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Seat" }));

      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("Not seated.");
      expect(banner).toHaveTextContent("Table is not available");
      expect(screen.queryByText(/failed: 409/)).toBeNull();
      expect(seatMutateAsync).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("");
      expect(screen.getByRole("button", { name: "Seat" })).toBeInTheDocument();
    });

    it('a 500 on the walk-in shows "Not seated." with the house sentence, never the request line', async () => {
      const walkIn = vi.fn().mockRejectedValue(serverError("POST", "/api/v1/reservations/walk-in"));
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      mockMutationHooks();
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Seat" }));

      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("Not seated.");
      expect(banner).toHaveTextContent(ERROR_COPY.serverError.detail);
      expect(screen.queryByText(/failed: 500/)).toBeNull();
    });

    it("surfaces a distinct partial-state error when walk-in succeeds but marking seated fails", async () => {
      const walkIn = vi.fn().mockResolvedValue({ id: "res-1" });
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      const seatMutateAsync = vi.fn().mockRejectedValue(new Error("Network error"));
      mockMutationHooks({ seat: { mutateAsync: seatMutateAsync } });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", partySize: 4, guestName: "Jane Doe" })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Seat" }));

      await waitFor(() => {
        expect(walkIn).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(seatMutateAsync).toHaveBeenCalledWith("wl-1");
      });
      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent(
        "Seated at Table 1, but the waitlist didn't update. Refresh to tidy up."
      );
      expect(screen.queryByText("Network error")).toBeNull();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it("disables seating when no table is available for the party size", () => {
      vi.mocked(useTables).mockReturnValue({
        data: [makeTable({ capacity: 2 })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", partySize: 4 })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderPage();

      expect(screen.getByRole("button", { name: "Seat" })).toBeDisabled();
    });
  });

  describe("table auto-select", () => {
    /**
     * Asserting on the <select> element's DOM `.value` is not reliable here:
     * jsdom (like real browsers) falls back to displaying the first <option>
     * whenever the controlled `value` prop doesn't match any option, which
     * masks whether the underlying React `tableId` state was actually set.
     * Clicking Seat exercises the real state — an unset `tableId` short-circuits
     * with "Please select a table." instead of calling `walkIn`.
     */
    it("auto-selects the first eligible table once table data arrives asynchronously", async () => {
      const walkIn = vi.fn().mockResolvedValue({ id: "res-1" });
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", partySize: 4 })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      // Simulate useTables not having resolved yet on first render.
      vi.mocked(useTables).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { rerender } = renderPage();

      expect(screen.queryByLabelText(/table/i)).not.toBeInTheDocument();

      // Table data resolves on a subsequent render.
      vi.mocked(useTables).mockReturnValue({
        data: [makeTable({ id: "table-9", name: "Table 9", capacity: 4 })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <WaitlistPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: "Seat" }));

      await waitFor(() => {
        expect(walkIn).toHaveBeenCalledWith(expect.objectContaining({ tableId: "table-9" }));
      });
      expect(screen.queryByText(/please select a table/i)).not.toBeInTheDocument();
    });

    it("does not overwrite a table the staff member already manually selected", async () => {
      const walkIn = vi.fn().mockResolvedValue({ id: "res-1" });
      vi.mocked(useApiClient).mockReturnValue({
        reservations: { walkIn },
      } as unknown as ReturnType<typeof useApiClient>);
      vi.mocked(useWaitlist).mockReturnValue({
        data: [makeEntry({ id: "wl-1", partySize: 4 })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useTables).mockReturnValue({
        data: [
          makeTable({ id: "table-1", name: "Table 1", capacity: 4 }),
          makeTable({ id: "table-2", name: "Table 2", capacity: 6 }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { rerender } = renderPage();

      fireEvent.change(screen.getByLabelText(/table/i), { target: { value: "table-2" } });

      // A new, differently-ordered table list arrives (e.g. a background refetch).
      vi.mocked(useTables).mockReturnValue({
        data: [
          makeTable({ id: "table-3", name: "Table 3", capacity: 4 }),
          makeTable({ id: "table-2", name: "Table 2", capacity: 6 }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      rerender(
        <MemoryRouter>
          <WaitlistPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("button", { name: "Seat" }));

      await waitFor(() => {
        expect(walkIn).toHaveBeenCalledWith(expect.objectContaining({ tableId: "table-2" }));
      });
    });
  });
});
