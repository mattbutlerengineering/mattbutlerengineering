import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { WaitlistPage } from "./WaitlistPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import {
  useWaitlist,
  useCreateWaitlistEntry,
  useNotifyWaitlistEntry,
  useCancelWaitlistEntry,
} from "../hooks/useWaitlist.js";
import type { WaitlistEntry } from "@mbe/types";
import React from "react";

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useWaitlist.js", () => ({
  useWaitlist: vi.fn(),
  useCreateWaitlistEntry: vi.fn(),
  useNotifyWaitlistEntry: vi.fn(),
  useCancelWaitlistEntry: vi.fn(),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

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
    Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
    EmptyState: ({
      heading,
      description,
    }: {
      heading: React.ReactNode;
      description?: React.ReactNode;
    }) => (
      <div data-testid="empty-state">
        <span>{heading}</span>
        <span>{description}</span>
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
    Skeleton: () => <div data-testid="skeleton" />,
    SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="skeleton-group">{children}</div>
    ),
    Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Text: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <span className={className}>{children}</span>
    ),
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
  return within(cardsList as HTMLElement).getAllByTestId("card");
}

function mockMutationHooks(
  overrides: {
    create?: Partial<ReturnType<typeof useCreateWaitlistEntry>>;
    notify?: Partial<ReturnType<typeof useNotifyWaitlistEntry>>;
    cancel?: Partial<ReturnType<typeof useCancelWaitlistEntry>>;
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
}

describe("WaitlistPage", () => {
  beforeEach(() => {
    vi.mocked(useVenue).mockReturnValue(mockVenue);
    mockMutationHooks();
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

  it("shows error alert when fetch fails, without throwing", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("alert")).toBeInTheDocument();
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

    it("surfaces an API error inline instead of failing silently", async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error("Duplicate phone number"));
      mockMutationHooks({ create: { mutateAsync } });
      renderPage();

      fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Add to Waitlist" }));

      await waitFor(() => {
        expect(screen.getByText("Duplicate phone number")).toBeInTheDocument();
      });
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

    it("surfaces a row action error inline instead of failing silently", async () => {
      const notifyMutateAsync = vi.fn().mockRejectedValue(new Error("SMS provider unavailable"));
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
        expect(screen.getByText("SMS provider unavailable")).toBeInTheDocument();
      });
    });
  });
});
