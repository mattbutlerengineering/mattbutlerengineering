import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvitePage } from "./InvitePage.js";

const mockDownload = vi.fn();
const mockBuildIcs = vi.fn();
vi.mock("../utils/ics.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    buildReservationIcs: (...args: unknown[]) => {
      mockBuildIcs(...args);
      return (actual.buildReservationIcs as (...a: unknown[]) => string)(...args);
    },
    downloadIcsFile: (...args: unknown[]) => mockDownload(...args),
  };
});

const mockParams: { token?: string } = {};
const mockSearchParams = new URLSearchParams();
vi.mock("react-router", () => ({
  useParams: () => mockParams,
  useSearchParams: () => [mockSearchParams, vi.fn()],
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const invite = {
  venue: { name: "The Oak Table", slug: "the-oak-table" },
  date: "2026-06-15",
  time: "19:00",
  partySize: 4,
  rsvps: [
    { firstName: "Sam", status: "IN" },
    { firstName: "Alex", status: "OUT" },
  ],
  status: "CONFIRMED",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvitePage />
    </QueryClientProvider>
  );
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  mockParams.token = "venue_1.secret";
  for (const k of [...mockSearchParams.keys()]) mockSearchParams.delete(k);
  mockReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", mockFetch);
});

describe("InvitePage", () => {
  it("renders the invitation card from the GET payload", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();

    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(new URL(calledUrl, "http://localhost").pathname).toBe(
      "/public/v1/invites/venue_1.secret"
    );
    expect(screen.getByText(/Monday, June 15, 2026/)).toBeDefined();
    expect(screen.getByText(/7:00\s?PM/)).toBeDefined();
    expect(screen.getByText(/4 guests/)).toBeDefined();
    expect(document.title).toContain("The Oak Table");
  });

  it("lists RSVPs with first names only", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Sam")).toBeDefined());
    expect(screen.getByText("Alex")).toBeDefined();
  });

  it("POSTs an IN RSVP with the first name and adds it to the list", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jo" } });
    mockFetch.mockResolvedValueOnce(json(201, { data: { ok: true } }));
    fireEvent.click(screen.getByRole("button", { name: "I'm in" }));

    await waitFor(() => expect(screen.getByText("Jo")).toBeDefined());
    const [url, options] = mockFetch.mock.calls[1]!;
    expect(new URL(url as string, "http://localhost").pathname).toBe(
      "/public/v1/invites/venue_1.secret/rsvp"
    );
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ firstName: "Jo", status: "IN" });
  });

  it("POSTs an OUT RSVP for Can't make it", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jo" } });
    mockFetch.mockResolvedValueOnce(json(201, { data: { ok: true } }));
    fireEvent.click(screen.getByRole("button", { name: "Can't make it" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mockFetch.mock.calls[1]![1].body as string)).toEqual({
      firstName: "Jo",
      status: "OUT",
    });
  });

  it("does not POST without a first name", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "I'm in" }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows a full message on 409", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jo" } });
    mockFetch.mockResolvedValueOnce(
      json(409, { type: "about:blank", title: "Invitation Full", status: 409 })
    );
    fireEvent.click(screen.getByRole("button", { name: "I'm in" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no spots left/i));
  });

  it("renders the ended state on 410", async () => {
    mockFetch.mockResolvedValueOnce(
      json(410, { type: "about:blank", title: "Invitation Ended", status: 410 })
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("This invitation has ended")).toBeDefined());
    expect(screen.queryByRole("button", { name: "I'm in" })).toBeNull();
  });

  it("has a level-one heading while the invitation loads", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Loading invitation..." })).toBeDefined();
  });

  it("renders the not-found state for an unknown token", async () => {
    mockFetch.mockResolvedValueOnce(
      json(404, { type: "about:blank", title: "Not Found", status: 404 })
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Invitation not found")).toBeDefined());
  });

  it("downloads an .ics built without a cancellation URL", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Download .ics" }));

    expect(mockBuildIcs).toHaveBeenCalledTimes(1);
    const opts = mockBuildIcs.mock.calls[0]![2] as { cancellationUrl?: string } | undefined;
    expect(opts?.cancellationUrl).toBeUndefined();
    expect(mockDownload).toHaveBeenCalledTimes(1);
    const ics = mockDownload.mock.calls[0]![0] as string;
    expect(ics).toContain("DTSTART:20260615T190000");
    expect(ics).toContain("DTEND:20260615T210000");
    expect(ics).toContain("The Oak Table");
    expect(ics).not.toContain("/reservations/manage");
  });

  it("plays the reveal animation by default", async () => {
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    expect(screen.getByTestId("invite-card").getAttribute("data-reveal")).toBe("animated");
  });

  it("disables the reveal animation under prefers-reduced-motion", async () => {
    mockReducedMotion(true);
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    expect(screen.getByTestId("invite-card").getAttribute("data-reveal")).toBe("static");
  });

  it("preserves the ref=invite attribution param on the page", async () => {
    mockSearchParams.set("ref", "invite");
    mockFetch.mockResolvedValueOnce(json(200, { data: invite }));
    renderPage();
    await waitFor(() => expect(screen.getByText("The Oak Table")).toBeDefined());

    expect(screen.getByRole("main").getAttribute("data-ref")).toBe("invite");
  });
});
