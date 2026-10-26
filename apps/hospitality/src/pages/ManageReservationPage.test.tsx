import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { ManageReservationPage } from "./ManageReservationPage.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatLongDateWithYear, formatTimeIn } from "../utils/format.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import enUS from "../i18n/catalogs/en-US.json";
import {
  EMPTY_NOTES,
  TWO_LINE_DISPLAYED,
  TWO_LINE_NOTE,
  UNTRUSTED_NOTE,
} from "../test/special-requests-fixtures.js";

// Stand-in for the dialog (covered by its own suite): one button that reports a completed change.
vi.mock("../components/manage-reservation/ChangeBookingDialog.js", () => ({
  ChangeBookingDialog: ({ onChanged }: { onChanged: (r: unknown) => void }) => (
    <button type="button" onClick={() => onChanged({})}>
      mock-change-done
    </button>
  ),
}));

const mockBuildIcs = vi.fn();
vi.mock("../utils/ics.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    buildReservationIcs: (...args: unknown[]) => {
      mockBuildIcs(...args);
      return (actual.buildReservationIcs as (...a: unknown[]) => string)(...args);
    },
    downloadIcsFile: vi.fn(),
  };
});

const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();
vi.mock("react-router", () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

// ApiClient uses fetch internally. Stub it so we control responses and can
// assert on the URL pattern it calls (verifying ApiClient routing is used).
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeOkResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const validVenue = {
  id: "venue_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  phone: "+15035551234",
};

const validReservation = {
  id: "res_1",
  date: "2026-06-15",
  startTime: "2026-06-15T19:00:00.000Z",
  endTime: "2026-06-15T21:00:00.000Z",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  status: "PENDING",
  notes: null as string | null,
};

function makeManagedPayload(
  overrides: {
    reservation?: Partial<typeof validReservation>;
    venue?: Partial<typeof validVenue> | null;
  } = {}
) {
  return {
    data: {
      reservation: { ...validReservation, ...overrides.reservation },
      venue: overrides.venue === null ? null : { ...validVenue, ...overrides.venue },
    },
  };
}

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
      <ManageReservationPage />
    </Wrapper>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete("token");
  mockSearchParams.delete("rebook");
});

describe("ManageReservationPage", () => {
  describe("document title (#4973)", () => {
    it("sets a venue-specific reservation title once the reservation resolves", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();

      await waitFor(() => {
        expect(document.title).toBe("The Oak Table — Your reservation");
      });
    });
  });

  describe("no-access-link state (#4980)", () => {
    it("shows the message and an actionable link out (no dead end)", () => {
      renderPage();
      expect(screen.getByText("No Access Link")).toBeDefined();
      expect(screen.getByText("Please check the link in your confirmation email.")).toBeDefined();
      expect(screen.getByRole("link", { name: /matt butler engineering/i })).toBeDefined();
    });
  });

  it("routes reservation lookup through ApiClient — calls manage endpoint via structured URL", async () => {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

    renderPage();
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

    // ApiClient constructs the URL from baseUrl + path
    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/public/v1/reservations/manage");
    expect(calledUrl).toContain("token=valid-token-abc");
  });

  describe("valid reservation (#4980)", () => {
    it("formats date and time instead of showing raw ISO values", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

      const expectedDate = formatLongDateWithYear(validReservation.date);
      const expectedStart = formatTimeIn(validReservation.startTime, validVenue.ianaTimezone);
      const expectedEnd = formatTimeIn(validReservation.endTime, validVenue.ianaTimezone);

      expect(screen.getByText(expectedDate)).toBeDefined();
      expect(screen.getByText(`${expectedStart} – ${expectedEnd}`)).toBeDefined();
      expect(screen.queryByText(validReservation.date)).toBeNull();
      expect(screen.queryByText(validReservation.startTime)).toBeNull();
    });

    it("shows reservation details for valid token", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(makeManagedPayload({ reservation: { notes: "Window seat please" } }))
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeDefined();
      });
      expect(screen.getByText("The Oak Table")).toBeDefined();
      expect(screen.getByText("4 guests")).toBeDefined();
    });

    it("offers add-to-calendar links and a call-the-venue link (no dead end)", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

      expect(screen.getByRole("button", { name: /download \.ics/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /google calendar/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /outlook/i })).toBeDefined();
      const callLink = screen.getByRole("link", { name: /call the oak table/i });
      expect(callLink.getAttribute("href")).toBe(`tel:${validVenue.phone}`);
    });

    it("cancels the reservation via the reused CancelReservationDialog", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));

      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

      fireEvent.click(screen.getByRole("button", { name: /cancel reservation/i }));

      const dialog = await screen.findByRole("dialog");
      mockFetch.mockResolvedValueOnce(makeOkResponse({ data: { status: "CANCELLED" } }));
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(makeManagedPayload({ reservation: { status: "CANCELLED" } }))
      );

      fireEvent.click(within(dialog).getByRole("button", { name: /^cancel reservation$/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      const cancelCall = mockFetch.mock.calls.find(
        (call) =>
          (call[1] as RequestInit | undefined)?.method === "DELETE" &&
          String(call[0]).includes("/public/v1/reservations/manage")
      );
      expect(cancelCall).toBeDefined();
      const headers = (cancelCall![1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer valid-token-abc");
    });
  });

  describe("link-expired state (#4980)", () => {
    it("shows the message and an actionable link out (no dead end)", async () => {
      mockSearchParams.set("token", "expired-token");
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(410, { status: 410, detail: "Token expired" })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Link Expired")).toBeDefined();
      });
      expect(screen.getByRole("link", { name: /matt butler engineering/i })).toBeDefined();
    });
  });

  describe("invalid-link state (#4980)", () => {
    it("shows the message and an actionable link out (no dead end)", async () => {
      mockSearchParams.set("token", "bad-token");
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(401, { status: 401, detail: "Invalid token" })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Invalid Link")).toBeDefined();
        expect(screen.getByText("This link has already been used or is invalid.")).toBeDefined();
      });
      expect(screen.getByRole("link", { name: /matt butler engineering/i })).toBeDefined();
    });
  });
  describe("cancelled by the venue", () => {
    const venueCancellation = {
      refundStatus: "done",
      offers: [
        {
          id: "2026-06-20T02:00:00.000Z",
          date: "2026-06-19",
          startTime: "2026-06-20T02:00:00.000Z",
        },
      ],
      rebooked: null,
    };

    function payload(cancellation: unknown) {
      const base = makeManagedPayload({ reservation: { status: "CANCELLED" } });
      return { data: { ...base.data, venueCancellation: cancellation } };
    }

    it("shows the refund status and rebook offers instead of the generic cancelled line", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(payload(venueCancellation)));

      renderPage();

      await waitFor(() => expect(screen.getByText("Your reservation was cancelled")).toBeDefined());
      expect(screen.getByText(/deposit has been refunded/i)).toBeDefined();
      expect(screen.getAllByRole("button", { name: /^Rebook/ })).toHaveLength(1);
      expect(screen.queryByText("This reservation has been cancelled.")).toBeNull();
    });

    it("with no offers shows only the picker link", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(payload({ refundStatus: "none", offers: [], rebooked: null }))
      );

      renderPage();

      await waitFor(() => expect(screen.getByText("Your reservation was cancelled")).toBeDefined());
      expect(screen.queryByRole("button", { name: /^Rebook/ })).toBeNull();
      expect(screen.getByRole("link", { name: /other dates and times/i })).toBeDefined();
    });

    it("shows a rebooked state linking to the new reservation, with no offers", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(
        makeOkResponse(
          payload({
            refundStatus: "none",
            offers: [],
            rebooked: { startTime: "2026-06-20T02:00:00.000Z", manageToken: "new-tok" },
          })
        )
      );

      renderPage();

      await waitFor(() => expect(screen.getByText(/you.re rebooked for/i)).toBeDefined());
      expect(screen.queryByRole("button", { name: /^Rebook/ })).toBeNull();
      const link = screen.getByRole("link", { name: /view your new reservation/i });
      expect(link.getAttribute("href")).toContain("token=new-tok");
    });

    it("a booking cancelled by the guest keeps the plain cancelled line", async () => {
      mockSearchParams.set("token", "valid-token-abc");
      mockFetch.mockResolvedValueOnce(makeOkResponse(payload(null)));

      renderPage();

      await waitFor(() =>
        expect(screen.getByText("This reservation has been cancelled.")).toBeDefined()
      );
      expect(screen.queryByText("Your reservation was cancelled")).toBeNull();
    });
  });

  describe("landmarks (axe landmark-one-main / page-has-heading-one)", () => {
    function landmarks() {
      return {
        mains: screen.getAllByRole("main"),
        h1s: screen.getAllByRole("heading", { level: 1 }),
      };
    }

    it("no-token state has one main and an h1", () => {
      renderPage();
      const { mains, h1s } = landmarks();
      expect(mains).toHaveLength(1);
      expect(h1s).toHaveLength(1);
    });

    it("loading state has one main and an h1", () => {
      mockSearchParams.set("token", "slow-token");
      mockFetch.mockReturnValueOnce(new Promise<Response>(vi.fn()));
      renderPage();
      const { mains, h1s } = landmarks();
      expect(mains).toHaveLength(1);
      expect(h1s).toHaveLength(1);
    });

    it("error state has one main and an h1", async () => {
      mockSearchParams.set("token", "bad-token");
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(401, { status: 401, detail: "Invalid token" })
      );
      renderPage();
      await waitFor(() => expect(screen.getByText("Invalid Link")).toBeDefined());
      const { mains, h1s } = landmarks();
      expect(mains).toHaveLength(1);
      expect(h1s).toHaveLength(1);
      expect(within(screen.getByRole("main")).getByText("Invalid Link")).toBeDefined();
    });

    it("resolved state has one main and an h1", async () => {
      mockSearchParams.set("token", "valid-token");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload()));
      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());
      const { mains, h1s } = landmarks();
      expect(mains).toHaveLength(1);
      expect(h1s).toHaveLength(1);
      expect(within(screen.getByRole("main")).getByText("Jane Doe")).toBeDefined();
      expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toBeDefined();
    });

    it("resolved state without a venue still has an h1", async () => {
      mockSearchParams.set("token", "valid-token");
      mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload({ venue: null })));
      renderPage();
      await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());
      const { mains, h1s } = landmarks();
      expect(mains).toHaveLength(1);
      expect(h1s).toHaveLength(1);
    });
  });
});

describe("ManageReservationPage Special Requests card", () => {
  const label = enUS.bookingWidget.specialRequests.label;

  async function renderWithNotes(notes: string | null, status = "PENDING") {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeManagedPayload({ reservation: { notes, status } as never }))
    );
    const view = renderPage();
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());
    return view;
  }

  /** Every Card here is `<Card><Stack><Text as="h2">`, so a card is its heading's grandparent. */
  function cardOf(heading: HTMLElement): HTMLElement {
    const card = heading.parentElement?.parentElement;
    if (!card) throw new Error("heading is not inside a Card");
    return card;
  }

  function cardCount(container: HTMLElement): number {
    const cardClass = cardOf(screen.getByRole("heading", { name: "Reservation Details" }))
      .classList[0];
    if (!cardClass) throw new Error("Card has no class");
    return container.getElementsByClassName(cardClass).length;
  }

  function wordsOf(group: HTMLElement): HTMLElement {
    const words = group.querySelector<HTMLElement>('[dir="auto"]');
    if (!words) throw new Error("no words element in the Special Requests group");
    return words;
  }

  it("names the group by its h2 and says the acknowledgement", async () => {
    await renderWithNotes(TWO_LINE_NOTE);
    const group = screen.getByRole("group", { name: label });
    expect(within(group).getByRole("heading", { level: 2, name: label })).toBeDefined();
    expect(
      within(group).getByText(enUS.bookingWidget.specialRequests.acknowledgement)
    ).toBeDefined();
  });

  it("renders the guest's words as one text node, line break kept, dir=auto", async () => {
    await renderWithNotes(TWO_LINE_NOTE);
    const words = wordsOf(screen.getByRole("group", { name: label }));
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(words.firstChild?.nodeValue).toBe(TWO_LINE_DISPLAYED);
    expect(words.classList.contains("requestsText")).toBe(true);
  });

  it("moves the request out of the details card, so the group appears once", async () => {
    await renderWithNotes(TWO_LINE_NOTE);
    const details = cardOf(screen.getByRole("heading", { name: "Reservation Details" }));
    expect(within(details).queryByText(label)).toBeNull();
    expect(screen.getAllByRole("group", { name: label })).toHaveLength(1);
  });

  it("sits after the details card and before Add to Calendar", async () => {
    await renderWithNotes(TWO_LINE_NOTE);
    const group = screen.getByRole("group", { name: label });
    const details = cardOf(screen.getByRole("heading", { name: "Reservation Details" }));
    const calendar = screen.getByRole("heading", { name: "Add to Calendar" });
    expect(details.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still shows the group on a CANCELLED reservation", async () => {
    await renderWithNotes(TWO_LINE_NOTE, "CANCELLED");
    expect(screen.getByText("This reservation has been cancelled.")).toBeDefined();
    expect(screen.getByRole("group", { name: label })).toBeDefined();
  });

  it.each(EMPTY_NOTES)("renders no block, label, line or card for %j", async (notes) => {
    const withNotes = await renderWithNotes(TWO_LINE_NOTE);
    const present = cardCount(withNotes.container);
    withNotes.unmount();
    const { container } = await renderWithNotes(notes);
    expect(screen.queryByRole("group", { name: label })).toBeNull();
    expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(enUS.bookingWidget.specialRequests.acknowledgement)).toBeNull();
    expect(cardCount(container)).toBe(present - 1);
  });

  it("keeps untrusted text as literal characters", async () => {
    await renderWithNotes(UNTRUSTED_NOTE);
    const group = screen.getByRole("group", { name: label });
    const words = wordsOf(group);
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeValue).toBe(UNTRUSTED_NOTE);
    expect(group.querySelector("script, a")).toBeNull();
  });

  it("is never inside or around a live region", async () => {
    await renderWithNotes(TWO_LINE_NOTE);
    const group = screen.getByRole("group", { name: label });
    expect(group.closest("[aria-live]")).toBeNull();
    expect(group.querySelector("[aria-live]")).toBeNull();
  });

  it("wraps the words and insets the card with tokens (CSS text)", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/pages/ManageReservationPage.module.css"),
      "utf-8"
    );
    const rule = (name: string) => css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule("requestsText")).toMatch(/white-space:\s*pre-wrap;/);
    expect(rule("requestsText")).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(rule("cardInset")).toMatch(/padding:\s*var\(--rialto-space-lg\);/);
  });
});

describe("ManageReservationPage change booking", () => {
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  function mockPayload(
    reservation: Partial<typeof validReservation> = {},
    venue: Partial<typeof validVenue> & { modificationCutoffHours?: number | null } = {}
  ) {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(
        makeManagedPayload({
          reservation: { startTime: hoursFromNow(72), endTime: hoursFromNow(74), ...reservation },
          venue,
        })
      )
    );
  }

  it.each(["PENDING", "CONFIRMED"])("offers Change booking for %s", async (status) => {
    mockPayload({ status });
    renderPage();
    expect(await screen.findByRole("button", { name: /change booking/i })).toBeDefined();
  });

  it.each(["CANCELLED", "COMPLETED"])("does not offer Change booking for %s", async (status) => {
    mockPayload({ status });
    renderPage();
    await screen.findByText("The Oak Table");
    expect(screen.queryByRole("button", { name: /change booking/i })).toBeNull();
  });

  it("does not offer Change booking when venue is null", async () => {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(makeOkResponse(makeManagedPayload({ venue: null })));
    renderPage();
    await screen.findByRole("button", { name: /cancel reservation/i });
    expect(screen.queryByRole("button", { name: /change booking/i })).toBeNull();
  });

  it("inside the cutoff, hides the button and shows a caption with the call link", async () => {
    mockPayload(
      { startTime: hoursFromNow(2), endTime: hoursFromNow(4) },
      { modificationCutoffHours: 24 }
    );
    renderPage();
    await screen.findByText("The Oak Table");
    expect(screen.queryByRole("button", { name: /change booking/i })).toBeNull();
    expect(screen.getByText(/changes close 24 hours before your visit/i)).toBeDefined();
    expect(screen.getAllByRole("link", { name: /call the oak table/i }).length).toBeGreaterThan(0);
  });

  it("after a change: closes the dialog, refetches, announces, and uses the new time for the ICS", async () => {
    mockPayload();
    const newStart = hoursFromNow(96);
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(
        makeManagedPayload({ reservation: { startTime: newStart, endTime: hoursFromNow(98) } })
      )
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /change booking/i }));
    fireEvent.click(screen.getByRole("button", { name: "mock-change-done" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/your booking has been updated/i);
    expect(screen.queryByRole("button", { name: "mock-change-done" })).toBeNull();

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /download \.ics/i }));
      expect(mockBuildIcs).toHaveBeenLastCalledWith(
        expect.objectContaining({ startTime: newStart }),
        expect.anything()
      );
    });
  });
});
